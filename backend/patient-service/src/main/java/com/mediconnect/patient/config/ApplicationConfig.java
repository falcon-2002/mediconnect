package com.mediconnect.patient.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;

@Configuration
public class ApplicationConfig {
    @Bean
    Clock clock() { return Clock.systemUTC(); }

    @Bean
    OpenAPI openApi() {
        return new OpenAPI().info(new Info().title("MediConnect Patient Service")
                .version("0.1.0").description("Phase 1: localhost learning API. Use fictional patient data only."));
    }
}
