package com.mediconnect.auth.application;
import com.mediconnect.auth.api.*;
import com.mediconnect.auth.domain.Account;
import com.mediconnect.auth.persistence.AccountRepository;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Service
public class AuthService {
 private final AccountRepository accounts;
 private final PasswordEncoder passwords;
 private final JwtEncoder encoder;
 private final String issuer;
 private final String dummyHash;
 public AuthService(AccountRepository accounts,PasswordEncoder passwords,JwtEncoder encoder,
   @Value("${security.jwt.issuer}") String issuer){
  this.accounts=accounts;this.passwords=passwords;this.encoder=encoder;this.issuer=issuer;
  this.dummyHash=passwords.encode(UUID.randomUUID().toString());
 }
 public record AccountResponse(UUID id,String email,String role){}
 public record TokenResponse(String accessToken,String tokenType,long expiresIn){}
 @Transactional
 public AccountResponse register(RegisterRequest request){
  checkLength(request.password());
  var account=accounts.saveAndFlush(new Account(request.email(),passwords.encode(request.password())));
  return new AccountResponse(account.getId(),account.getEmail(),account.getRole());
 }
 @Transactional(readOnly=true)
 public TokenResponse login(LoginRequest request){
  checkLength(request.password());
  var account=accounts.findByEmail(request.email());
  boolean matches=passwords.matches(request.password(),account.map(Account::getPasswordHash).orElse(dummyHash));
  if(account.isEmpty() || !matches) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Invalid credentials");
  var now=Instant.now();
  var claims=JwtClaimsSet.builder().issuer(issuer).subject(account.get().getId().toString())
   .audience(List.of("mediconnect-api")).issuedAt(now).expiresAt(now.plusSeconds(900))
   .claim("roles",List.of(account.get().getRole())).build();
  return new TokenResponse(encoder.encode(JwtEncoderParameters.from(
   JwsHeader.with(SignatureAlgorithm.RS256).build(),claims)).getTokenValue(),"Bearer",900);
 }
 private void checkLength(String password){
  if(password.getBytes(StandardCharsets.UTF_8).length>72)
   throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Password exceeds 72 UTF-8 bytes");
 }
}
