package com.mediconnect.doctor.config;
import java.util.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
@ConfigurationProperties("doctor.catalog")
public record DoctorCatalog(Map<String,String> specialties, List<String> cities) {
    public DoctorCatalog {
        specialties=Collections.unmodifiableMap(new LinkedHashMap<>(specialties));
        cities=List.copyOf(cities);
    }
}
