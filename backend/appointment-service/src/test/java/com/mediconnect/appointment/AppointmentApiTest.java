package com.mediconnect.appointment;
import com.mediconnect.appointment.application.*;
import com.mediconnect.appointment.domain.*;
import com.mediconnect.appointment.persistence.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.converter.RsaKeyConverters;
import org.springframework.core.io.ClassPathResource;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.server.ResponseStatusException;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class AppointmentApiTest {
 @Autowired MockMvc mvc;@Autowired SlotRepository slots;@Autowired AppointmentRepository appointments;
 @Autowired BookingTransactions transactions;@MockitoBean DirectoryClient directory;
 UUID owner=UUID.randomUUID(), patient=UUID.randomUUID(), doctor=UUID.randomUUID();
 Instant start(){return Instant.ofEpochSecond((Instant.now().getEpochSecond()/1800+4)*1800);}
 Slot slot(){return slots.saveAndFlush(new Slot(doctor,start()));}
 @BeforeEach void clear(){appointments.deleteAll();slots.deleteAll();reset(directory);}
 org.springframework.test.web.servlet.request.RequestPostProcessor as(UUID id,String role){return jwt().jwt(j->j.subject(id.toString())).authorities(new SimpleGrantedAuthority("ROLE_"+role));}
 String body(Slot s){return "{\"slotId\":\""+s.id+"\",\"patientId\":\""+patient+"\"}";}
 String token(String subject,String role,String issuer,String audience,Instant expiry) throws Exception {
  try(var pub=new ClassPathResource("test-public.pem").getInputStream();var priv=new ClassPathResource("test-private.pem").getInputStream()){
   var key=new RSAKey.Builder(RsaKeyConverters.x509().convert(pub)).privateKey(RsaKeyConverters.pkcs8().convert(priv)).build();
   var encoder=new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(key)));
   return "Bearer "+encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).build(),JwtClaimsSet.builder()
    .subject(subject).issuer(issuer).audience(List.of(audience)).issuedAt(Instant.now().minusSeconds(600))
    .expiresAt(expiry).claim("roles",List.of(role)).build())).getTokenValue();
  }
 }
 String token(String subject,String role) throws Exception{return token(subject,role,"mediconnect-auth","mediconnect-api",Instant.now().plusSeconds(900));}

 @Test void realJwtValidation() throws Exception {
  mvc.perform(get("/api/appointments").header("Authorization",token(owner.toString(),"PATIENT"))).andExpect(status().isOk());
  mvc.perform(get("/api/appointments").header("Authorization",token(owner.toString(),"PATIENT","wrong","mediconnect-api",Instant.now().plusSeconds(300)))).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/appointments").header("Authorization",token(owner.toString(),"PATIENT","mediconnect-auth","wrong",Instant.now().plusSeconds(300)))).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/appointments").header("Authorization",token(owner.toString(),"PATIENT","mediconnect-auth","mediconnect-api",Instant.now().minusSeconds(120)))).andExpect(status().isUnauthorized());
 }
 @Test void slotCreationAndValidation() throws Exception {
  String json="{\"doctorId\":\""+doctor+"\",\"startsAt\":\""+start()+"\"}";
  mvc.perform(post("/api/slots").with(as(owner,"ADMIN")).contentType("application/json").content(json)).andExpect(status().isCreated());
  mvc.perform(post("/api/slots").with(as(owner,"ADMIN")).contentType("application/json").content(json)).andExpect(status().isConflict());
  mvc.perform(post("/api/slots").with(as(owner,"ADMIN")).contentType("application/json").content(json.replace(start().toString(),start().plusSeconds(1).toString()))).andExpect(status().isBadRequest());
  mvc.perform(get("/api/slots").param("doctorId",doctor.toString()).param("from",start().toString()).param("to",start().plusSeconds(3600).toString())).andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(1));
 }
 @Test void roleBoundariesAndMissingToken() throws Exception {
  Slot s=slot();
  mvc.perform(get("/api/slots/"+s.id)).andExpect(status().isOk()).andExpect(jsonPath("$.doctorId").value(doctor.toString()));
  mvc.perform(post("/api/appointments").contentType("application/json").content(body(s))).andExpect(status().isUnauthorized());
  for(String role:List.of("DOCTOR","ADMIN"))mvc.perform(post("/api/appointments").with(as(owner,role)).contentType("application/json").content(body(s))).andExpect(status().isForbidden());
  for(String role:List.of("PATIENT","DOCTOR"))mvc.perform(post("/api/slots").with(as(owner,role)).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(get("/api/appointments").with(as(owner,"DOCTOR"))).andExpect(status().isForbidden());
 }
 @Test void bookingOwnershipCancellationAndRebooking() throws Exception {
  Slot s=slot();
  mvc.perform(post("/api/appointments").with(as(owner,"PATIENT")).contentType("application/json").content(body(s))).andExpect(status().isCreated());
  var a=appointments.findAll().get(0);UUID stranger=UUID.randomUUID();
  mvc.perform(get("/api/appointments/"+a.id).with(as(stranger,"PATIENT"))).andExpect(status().isForbidden());
  mvc.perform(post("/api/appointments/"+a.id+"/cancel").with(as(stranger,"PATIENT"))).andExpect(status().isForbidden());
  mvc.perform(get("/api/appointments").with(as(stranger,"PATIENT"))).andExpect(jsonPath("$.totalItems").value(0));
  mvc.perform(get("/api/appointments/"+a.id).with(as(owner,"PATIENT"))).andExpect(status().isOk());
  mvc.perform(post("/api/appointments").with(as(owner,"PATIENT")).contentType("application/json").content(body(s))).andExpect(status().isConflict());
  for(int i=0;i<2;i++)mvc.perform(post("/api/appointments/"+a.id+"/cancel").with(as(owner,"PATIENT"))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
  transactions.book(s.id,patient,stranger);
  transactions.cancel(a.id,owner,false);
  assertThat(slots.findById(s.id).orElseThrow().booked).isTrue();
  assertThat(appointments.count()).isEqualTo(2);
 }
 @Test void remoteFailureWritesNothing() throws Exception {
  Slot s=slot();doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)).when(directory).doctor(doctor);
  mvc.perform(post("/api/appointments").with(as(owner,"PATIENT")).contentType("application/json").content(body(s))).andExpect(status().isServiceUnavailable());
  assertThat(appointments.count()).isZero();assertThat(slots.findById(s.id).orElseThrow().booked).isFalse();
 }
 @Test void otherPatientProfileDeniedBeforeWrite() throws Exception {
  Slot s=slot();doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN)).when(directory).patient(eq(patient),anyString());
  mvc.perform(post("/api/appointments").with(as(owner,"PATIENT")).contentType("application/json").content(body(s))).andExpect(status().isForbidden());assertThat(appointments.count()).isZero();
 }
 @Test void pastSlotCannotBeBooked(){Slot s=slots.saveAndFlush(new Slot(doctor,start().minusSeconds(86400)));assertThatThrownBy(()->transactions.book(s.id,patient,owner)).isInstanceOf(ResponseStatusException.class);assertThat(appointments.count()).isZero();}
 @Test void concurrentBookingsHaveExactlyOneWinner() throws Exception {
  Slot s=slot();int count=12;var pool=Executors.newFixedThreadPool(count);var gate=new CountDownLatch(1);
  try {
   List<Future<Integer>> results=new ArrayList<>();
   for(int i=0;i<count;i++)results.add(pool.submit(()->{gate.await();try{transactions.book(s.id,UUID.randomUUID(),UUID.randomUUID());return 201;}catch(ResponseStatusException e){return e.getStatusCode().value();}}));
   gate.countDown();List<Integer> codes=new ArrayList<>();for(var f:results)codes.add(f.get(30,TimeUnit.SECONDS));
   assertThat(codes.stream().filter(c->c==201).count()).isEqualTo(1);
   assertThat(codes.stream().filter(c->c==409).count()).isEqualTo(count-1);
   assertThat(appointments.count()).isEqualTo(1);assertThat(slots.findById(s.id).orElseThrow().booked).isTrue();
  }finally{pool.shutdownNow();}
 }
 @Test void concurrentCancellationsReleaseOnlyOnce() throws Exception {
  Slot s=slot();var a=transactions.book(s.id,patient,owner);var pool=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
  try{var x=pool.submit(()->{gate.await();return transactions.cancel(a.id,owner,false);});var y=pool.submit(()->{gate.await();return transactions.cancel(a.id,owner,false);});gate.countDown();assertThat(x.get(20,TimeUnit.SECONDS).status).isEqualTo("CANCELLED");assertThat(y.get(20,TimeUnit.SECONDS).status).isEqualTo("CANCELLED");assertThat(slots.findById(s.id).orElseThrow().booked).isFalse();}finally{pool.shutdownNow();}
 }
}
