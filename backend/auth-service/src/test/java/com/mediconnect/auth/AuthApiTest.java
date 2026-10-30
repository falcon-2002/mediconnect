package com.mediconnect.auth;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import com.mediconnect.auth.persistence.AccountRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.converter.RsaKeyConverters;
import org.springframework.core.io.ClassPathResource;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class AuthApiTest {
 @Autowired MockMvc mvc; @Autowired AccountRepository accounts; @Autowired PasswordEncoder passwords;
 @BeforeEach void clear(){accounts.deleteAll();}
 String body(String email,String password){return "{\"email\":\""+email+"\",\"password\":\""+password+"\"}";}
 @Test void registrationLoginAndSignedToken() throws Exception {
  mvc.perform(post("/api/auth/register").contentType("application/json").content(body(" DEMO@EXAMPLE.COM ","a-long-password")))
   .andExpect(status().isCreated()).andExpect(jsonPath("$.role").value("PATIENT")).andExpect(jsonPath("$.passwordHash").doesNotExist());
  var account=accounts.findByEmail("demo@example.com").orElseThrow();
  assertThat(passwords.matches("a-long-password",account.getPasswordHash())).isTrue();
  var json=mvc.perform(post("/api/auth/login").contentType("application/json").content(body("demo@example.com","a-long-password")))
   .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse().getContentAsString();
  String token=com.jayway.jsonpath.JsonPath.read(json,"$.accessToken");
  try(var in=new ClassPathResource("test-public.pem").getInputStream()){
   var jwt= NimbusJwtDecoder.withPublicKey(RsaKeyConverters.x509().convert(in)).build().decode(token);
   assertThat(jwt.getSubject()).isEqualTo(account.getId().toString());
   assertThat(jwt.getAudience()).contains("mediconnect-api");
   assertThat(jwt.getClaimAsStringList("roles")).containsExactly("PATIENT");
  }
 }
 @Test void rejectsEscalationDuplicateAndInvalidCredentials() throws Exception {
  String valid=body("demo@example.com","a-long-password");
  mvc.perform(post("/api/auth/register").contentType("application/json").content(valid.replace("}",",\"role\":\"ADMIN\"}"))).andExpect(status().isBadRequest());
  mvc.perform(post("/api/auth/register").contentType("application/json").content(valid)).andExpect(status().isCreated());
  mvc.perform(post("/api/auth/register").contentType("application/json").content(valid)).andExpect(status().isConflict());
  mvc.perform(post("/api/auth/login").contentType("application/json").content(body("demo@example.com","wrong-password"))).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/auth/login").contentType("application/json").content(body("missing@example.com","wrong-password"))).andExpect(status().isUnauthorized());
 }
 @Test void rejectsShortAndOversizedUtf8Passwords() throws Exception {
  for(String password:new String[]{"short","é".repeat(40)})
   mvc.perform(post("/api/auth/register").contentType("application/json").content(body("demo@example.com",password))).andExpect(status().isBadRequest());
 }
}
