package com.mediconnect.auth.config;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.context.annotation.*;
import org.springframework.security.converter.RsaKeyConverters;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.oauth2.jwt.*;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
@Configuration
public class SecurityConfig {
 @Bean PasswordEncoder passwords(){return new BCryptPasswordEncoder(12);}
 @Bean JwtEncoder encoder(@Value("${security.jwt.private-key}") Resource privateKey,
                          @Value("${security.jwt.public-key}") Resource publicKey) throws Exception {
  RSAPrivateKey priv; RSAPublicKey pub;
  try(var in=privateKey.getInputStream()){priv=RsaKeyConverters.pkcs8().convert(in);}
  try(var in=publicKey.getInputStream()){pub=RsaKeyConverters.x509().convert(in);}
  if(pub.getModulus().bitLength()<2048 || !pub.getModulus().equals(priv.getModulus()))
   throw new IllegalArgumentException("Use a matching RSA key pair of at least 2048 bits");
  return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(new RSAKey.Builder(pub).privateKey(priv).build())));
 }
 @Bean SecurityFilterChain security(HttpSecurity http) throws Exception {
  return http.csrf(c->c.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
   .authorizeHttpRequests(a->a.requestMatchers(org.springframework.http.HttpMethod.POST,"/api/auth/register","/api/auth/login").permitAll()
    .requestMatchers("/actuator/health").permitAll().anyRequest().denyAll())
   .exceptionHandling(e->e.authenticationEntryPoint((q,s,x)->s.sendError(401))).build();
 }
}
