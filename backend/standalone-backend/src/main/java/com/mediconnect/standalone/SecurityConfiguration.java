package com.mediconnect.standalone;

import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.converter.RsaKeyConverters;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.*;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
public class SecurityConfiguration {
    @Bean PasswordEncoder passwords() { return new BCryptPasswordEncoder(12); }
    @Bean RSAPublicKey jwtPublicKey(@Value("${security.jwt.public-key}") Resource resource) throws Exception {
        try (var input = resource.getInputStream()) {
            var key = RsaKeyConverters.x509().convert(input);
            if (key.getModulus().bitLength() < 2048) throw new IllegalArgumentException("Use RSA of at least 2048 bits");
            return key;
        }
    }
    @Bean JwtEncoder encoder(@Value("${security.jwt.private-key}") Resource resource, RSAPublicKey publicKey) throws Exception {
        RSAPrivateKey privateKey;
        try (var input = resource.getInputStream()) { privateKey = RsaKeyConverters.pkcs8().convert(input); }
        if (!publicKey.getModulus().equals(privateKey.getModulus())) throw new IllegalArgumentException("Use a matching RSA pair");
        return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(new RSAKey.Builder(publicKey).privateKey(privateKey).build())));
    }
    @Bean JwtDecoder decoder(RSAPublicKey publicKey, @Value("${security.jwt.issuer}") String issuer) {
        var decoder = NimbusJwtDecoder.withPublicKey(publicKey).build();
        OAuth2TokenValidator<Jwt> claims = jwt -> {
            try {
                UUID.fromString(jwt.getSubject());
                if (jwt.getExpiresAt() != null && jwt.getAudience().contains("mediconnect-api")) return OAuth2TokenValidatorResult.success();
            } catch (RuntimeException ignored) { }
            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
        };
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(issuer), claims));
        return decoder;
    }
    @Bean JwtAuthenticationConverter jwtAuthenticationConverter() {
        var roles = new JwtGrantedAuthoritiesConverter();
        roles.setAuthoritiesClaimName("roles"); roles.setAuthorityPrefix("ROLE_");
        var converter = new JwtAuthenticationConverter(); converter.setJwtGrantedAuthoritiesConverter(roles);
        return converter;
    }
    @Bean SecurityFilterChain security(HttpSecurity http, JwtAuthenticationConverter converter) throws Exception {
        return http.csrf(c -> c.disable()).sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/doctors", "/api/doctors/**", "/api/slots", "/api/slots/**").permitAll()
                        .requestMatchers("/api/doctors", "/api/doctors/**", "/api/slots", "/api/slots/**").hasRole("ADMIN")
                        .requestMatchers("/api/patients", "/api/patients/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/appointments").hasRole("PATIENT")
                        .requestMatchers("/api/appointments", "/api/appointments/**").hasAnyRole("PATIENT", "ADMIN")
                        .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(converter))).build();
    }
}
