package com.mediconnect.doctor.api;
import com.mediconnect.doctor.domain.Doctor;
import java.util.*;
import java.time.Instant;
import java.math.BigDecimal;
public record DoctorResponse(UUID id,String name,String specialty,String city,String area,String clinic,
        String qualifications,int experienceYears,BigDecimal feeInRupees,List<String> languages,String about,
        String initials,String color,boolean active,long version,Instant createdAt,Instant updatedAt) {
    public static DoctorResponse from(Doctor d){
        String initials=Arrays.stream(d.getName().split("\\s+")).limit(2)
            .map(s->s.substring(0,1).toUpperCase(Locale.ROOT)).reduce("",String::concat);
        return new DoctorResponse(d.getId(),d.getName(),d.getSpecialty(),d.getCity(),d.getArea(),d.getClinic(),
            d.getQualifications(),d.getExperienceYears(),d.getFeeInRupees(),d.getLanguages(),d.getAbout(),initials,
            d.getColor(),d.isActive(),d.getVersion(),d.getCreatedAt(),d.getUpdatedAt());
    }
}
