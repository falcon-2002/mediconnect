package com.mediconnect.doctor.api;
import jakarta.validation.constraints.*;
public record UpdateDoctorRequest(
        @NotBlank @Size(min=2,max=100) String name,
        @NotBlank @Size(max=40) String specialty,
        @NotBlank @Size(max=80) String city,
        @NotBlank @Size(max=100) String area,
        @NotBlank @Size(max=150) String clinic,
        @NotBlank @Size(max=300) String qualifications,
        @NotNull @Min(0) @Max(80) Integer experienceYears,
        @NotNull @DecimalMin("0") @DecimalMax("1000000") @Digits(integer=7,fraction=2) java.math.BigDecimal feeInRupees,
        @NotEmpty @Size(max=10) java.util.List<@NotBlank @Size(max=40) String> languages,
        @NotBlank @Size(max=2000) String about,
        @NotBlank @Pattern(regexp="sage|sand|rose|sky") String color,
        @NotNull @Min(0) Long version) {
    public UpdateDoctorRequest {
        name=trim(name); specialty=trim(specialty); city=trim(city); area=trim(area);
        clinic=trim(clinic); qualifications=trim(qualifications); about=trim(about); color=trim(color);
        if(languages!=null) languages=languages.stream().map(UpdateDoctorRequest::trim).toList();
    }
    private static String trim(String value){return value==null?null:value.strip();}
}
