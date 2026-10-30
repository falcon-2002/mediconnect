package com.mediconnect.patient.config;
import java.security.interfaces.RSAPublicKey;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.context.annotation.*;
import org.springframework.security.converter.RsaKeyConverters;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.server.resource.authentication.*;
@Configuration @EnableMethodSecurity
public class SecurityConfig {
 @Bean JwtDecoder decoder(@Value("${security.jwt.public-key}") Resource resource,
   @Value("${security.jwt.issuer}") String issuer) throws Exception {
  RSAPublicKey key;
  try(var in=resource.getInputStream()){key=RsaKeyConverters.x509().convert(in);}
  var decoder=NimbusJwtDecoder.withPublicKey(key).build();
  OAuth2TokenValidator<Jwt> claims=jwt->{
   try {
    UUID.fromString(jwt.getSubject());
    if(jwt.getExpiresAt()!=null && jwt.getAudience().contains("mediconnect-api")) return OAuth2TokenValidatorResult.success();
   } catch(RuntimeException ignored) {}
   return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
  };
  decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(issuer),claims));
  return decoder;
 }
 @Bean SecurityFilterChain security(HttpSecurity http) throws Exception {
  var roles=new JwtGrantedAuthoritiesConverter(); roles.setAuthoritiesClaimName("roles");roles.setAuthorityPrefix("ROLE_");
  var converter=new JwtAuthenticationConverter();converter.setJwtGrantedAuthoritiesConverter(roles);
  return http.csrf(c->c.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
   .authorizeHttpRequests(a->a.requestMatchers("/actuator/health").permitAll().anyRequest().authenticated())
   .oauth2ResourceServer(o->o.jwt(j->j.jwtAuthenticationConverter(converter))).build();
 }
}
