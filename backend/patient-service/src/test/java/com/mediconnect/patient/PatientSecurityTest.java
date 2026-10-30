package com.mediconnect.patient;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import com.mediconnect.patient.persistence.PatientRepository;
import java.util.*;
import java.time.Instant;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.converter.RsaKeyConverters;
import org.springframework.core.io.ClassPathResource;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PatientSecurityTest {
 @Autowired MockMvc mvc; @Autowired PatientRepository patients;
 String alice=UUID.randomUUID().toString(),bob=UUID.randomUUID().toString();
 @BeforeEach void clear(){patients.deleteAll();}
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
 @Test void enforcesOwnershipAndRoleWithRealSignedTokens() throws Exception {
  String a=token(alice,"PATIENT"),b=token(bob,"PATIENT"),admin=token(UUID.randomUUID().toString(),"ADMIN");
  String json=mvc.perform(post("/api/patients").header("Authorization",a).contentType("application/json").content(PatientApiContract.createJson("alice@example.com")))
   .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
  String path="/api/patients/"+PatientApiContract.id(json);
  mvc.perform(get(path).header("Authorization",a)).andExpect(status().isOk());
  mvc.perform(get(path).header("Authorization",b)).andExpect(status().isForbidden());
  mvc.perform(delete(path).header("Authorization",b)).andExpect(status().isForbidden());
  mvc.perform(put(path).header("Authorization",b).contentType("application/json").content(PatientApiContract.createJson("alice@example.com").replace("}",",\"version\":0}"))).andExpect(status().isForbidden());
  mvc.perform(get(path).header("Authorization",token(bob,"DOCTOR"))).andExpect(status().isForbidden());
  mvc.perform(get(path).header("Authorization",admin)).andExpect(status().isOk());
  mvc.perform(get("/api/patients").header("Authorization",a)).andExpect(status().isForbidden());
  mvc.perform(get("/api/patients").header("Authorization",admin)).andExpect(status().isOk());
  mvc.perform(post("/api/patients").header("Authorization",a).contentType("application/json").content(PatientApiContract.createJson("other@example.com"))).andExpect(status().isConflict());
  mvc.perform(put(path).header("Authorization",a).contentType("application/json")
   .content(PatientApiContract.createJson("alice@example.com").replace("}",",\"version\":0}"))).andExpect(status().isOk());
  mvc.perform(delete(path).header("Authorization",a)).andExpect(status().isNoContent());
 }
 @Test void rejectsMissingInvalidExpiredWrongIssuerAndAudience() throws Exception {
  mvc.perform(get("/api/patients")).andExpect(status().isUnauthorized());
  String valid=token(alice,"PATIENT");
  int signature=valid.lastIndexOf('.')+1;
  String tampered=valid.substring(0,signature)+(valid.charAt(signature)=='A'?"B":"A")+valid.substring(signature+1);
  for(String t:List.of(tampered,"Bearer garbage",token(alice,"PATIENT","wrong","mediconnect-api",Instant.now().plusSeconds(900)),
   token(alice,"PATIENT","mediconnect-auth","wrong",Instant.now().plusSeconds(900)),
   token(alice,"PATIENT","mediconnect-auth","mediconnect-api",Instant.now().minusSeconds(300))))
   mvc.perform(get("/api/patients").header("Authorization",t)).andExpect(status().isUnauthorized());
 }
 @Test void existingUnownedPatientCannotBeClaimedByEmail() throws Exception {
  String json=mvc.perform(post("/api/patients").header("Authorization",token(UUID.randomUUID().toString(),"ADMIN"))
   .contentType("application/json").content(PatientApiContract.createJson("old@example.com"))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
  mvc.perform(get("/api/patients/"+PatientApiContract.id(json)).header("Authorization",token(alice,"PATIENT"))).andExpect(status().isForbidden());
  mvc.perform(post("/api/patients").header("Authorization",token(alice,"PATIENT")).contentType("application/json").content(PatientApiContract.createJson("old@example.com"))).andExpect(status().isConflict());
 }
}
