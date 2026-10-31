package com.mediconnect.doctor;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import com.mediconnect.doctor.persistence.DoctorRepository;
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
class DoctorApiTest {
 @Autowired MockMvc mvc; @Autowired DoctorRepository doctors;
 String alice=UUID.randomUUID().toString(),bob=UUID.randomUUID().toString();
 @BeforeEach void clear(){doctors.deleteAll();}
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

 String body(String name,String specialty,String city,int fee,int years){return """
 {"name":"%s","specialty":"%s","city":"%s","area":"Central","clinic":"Demo Clinic",
 "qualifications":"MBBS","experienceYears":%d,"feeInRupees":%d,"languages":["English","Hindi"],
 "about":"Fictional doctor for testing","color":"sage"}
 """.formatted(name,specialty,city,years,fee);}
 String admin() throws Exception{return token(alice,"ADMIN");}
 String create(String body) throws Exception {
  return mvc.perform(post("/api/doctors").header("Authorization",admin()).contentType("application/json").content(body))
   .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
 }
 String id(String json){return com.jayway.jsonpath.JsonPath.read(json,"$.id");}
 @Test void publicCatalogAndEmptySearch() throws Exception {
  mvc.perform(get("/api/doctors/catalog")).andExpect(status().isOk()).andExpect(jsonPath("$.specialties.dental").value("Dentist"));
  mvc.perform(get("/api/doctors")).andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(0));
  mvc.perform(get("/v3/api-docs")).andExpect(status().isOk());
 }
 @Test void adminCreatesPublicProfileAndTimestampsRoundTrip() throws Exception {
  String result=create(body("Anita Das","general","Rourkela",500,10));
  mvc.perform(get("/api/doctors/"+id(result))).andExpect(status().isOk()).andExpect(content().json(result))
   .andExpect(jsonPath("$.initials").value("AD")).andExpect(jsonPath("$.languages[1]").value("Hindi"));
 }
 @Test void filtersTokensAndSortsWithPagination() throws Exception {
  create(body("Anita Das","general","Rourkela",500,10));
  create(body("Bina Das","dental","Rourkela",300,15));
  create(body("Charu Das","dental","Bengaluru",700,3));
  mvc.perform(get("/api/doctors").param("query","DENTIST\tDEMO").param("city","Rourkela").param("maxFee","400"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(1)).andExpect(jsonPath("$.items[0].name").value("Bina Das"));
  mvc.perform(get("/api/doctors").param("specialty","dental").param("sort","fee").param("size","1").param("page","1"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(2)).andExpect(jsonPath("$.totalPages").value(2)).andExpect(jsonPath("$.items[0].name").value("Charu Das"));
  mvc.perform(get("/api/doctors").param("sort","experience")).andExpect(jsonPath("$.items[0].name").value("Bina Das"));
 }
 @Test void wildcardSearchIsLiteral() throws Exception {
  create(body("Anita Das","general","Rourkela",500,10));
  for(String q:List.of("%","_","!")) mvc.perform(get("/api/doctors").param("query",q)).andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(0));
 }
 @Test void validatesFieldsCatalogAndQueryBounds() throws Exception {
  for(String invalid:List.of(body("A","general","Rourkela",500,10),body("Anita","unknown","Rourkela",500,10),body("Anita","general","Nowhere",500,10),body("Anita","general","Rourkela",-1,10),body("Anita","general","Rourkela",500,81)))
   mvc.perform(post("/api/doctors").header("Authorization",admin()).contentType("application/json").content(invalid)).andExpect(status().isBadRequest());
  for(var pair:List.of(new String[]{"page","-1"},new String[]{"size","101"},new String[]{"size","0"},new String[]{"sort","password"},new String[]{"specialty","unknown"},new String[]{"maxFee","-1"}))
   mvc.perform(get("/api/doctors").param(pair[0],pair[1])).andExpect(status().isBadRequest());
  mvc.perform(get("/api/doctors/not-a-uuid")).andExpect(status().isBadRequest());
  mvc.perform(get("/api/doctors/"+UUID.randomUUID())).andExpect(status().isNotFound());
 }
 @Test void rejectsAnonymousPatientAndDoctorWrites() throws Exception {
  String data=body("Anita Das","general","Rourkela",500,10);
  String id=id(create(data));
  mvc.perform(post("/api/doctors").contentType("application/json").content(data)).andExpect(status().isUnauthorized());
  for(String role:List.of("PATIENT","DOCTOR")){
   String t=token(bob,role);
   mvc.perform(post("/api/doctors").header("Authorization",t).contentType("application/json").content(data)).andExpect(status().isForbidden());
   mvc.perform(put("/api/doctors/"+id).header("Authorization",t).contentType("application/json").content(data.replace("}",",\"version\":0}"))).andExpect(status().isForbidden());
   mvc.perform(delete("/api/doctors/"+id).header("Authorization",t)).andExpect(status().isForbidden());
  }
 }
 @Test void rejectsExpiredWrongIssuerWrongAudienceAndTamperedTokens() throws Exception {
  String valid=admin();int index=valid.lastIndexOf('.')+1;
  String tampered=valid.substring(0,index)+(valid.charAt(index)=='A'?"B":"A")+valid.substring(index+1);
  for(String t:List.of(tampered,"Bearer nonsense",token(alice,"ADMIN","wrong","mediconnect-api",Instant.now().plusSeconds(900)),
   token(alice,"ADMIN","mediconnect-auth","wrong",Instant.now().plusSeconds(900)),
   token(alice,"ADMIN","mediconnect-auth","mediconnect-api",Instant.now().minusSeconds(300))))
   mvc.perform(post("/api/doctors").header("Authorization",t).contentType("application/json").content(body("Anita","general","Rourkela",500,10))).andExpect(status().isUnauthorized());
 }
 @Test void updatesWithVersionAndSoftDeletesIdempotently() throws Exception {
  String data=body("Anita Das","general","Rourkela",500,10);
  String id=id(create(data));String update=data.replace("}",",\"version\":0}");
  mvc.perform(put("/api/doctors/"+id).header("Authorization",admin()).contentType("application/json").content(update.replace("500","600")))
   .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
  mvc.perform(put("/api/doctors/"+id).header("Authorization",admin()).contentType("application/json").content(update)).andExpect(status().isConflict());
  for(int i=0;i<2;i++)mvc.perform(delete("/api/doctors/"+id).header("Authorization",admin())).andExpect(status().isNoContent());
  mvc.perform(get("/api/doctors/"+id)).andExpect(status().isNotFound());
  mvc.perform(get("/api/doctors")).andExpect(jsonPath("$.totalItems").value(0));
  org.assertj.core.api.Assertions.assertThat(doctors.existsById(UUID.fromString(id))).isTrue();
 }
}
