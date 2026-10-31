package com.mediconnect.doctor.config;
import java.time.Clock;
import org.springframework.context.annotation.*;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.security.SecurityScheme;
@Configuration @EnableConfigurationProperties(DoctorCatalog.class)
public class ApplicationConfig {
    @Bean Clock clock() { return Clock.systemUTC(); }
    @Bean OpenAPI openApi() {
        return new OpenAPI().info(new Info().title("MediConnect Doctor Service").version("0.1.0"))
            .components(new Components().addSecuritySchemes("bearerAuth", new SecurityScheme()
                .type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")));
    }
}
