package com.mediconnect.patient.api;

import jakarta.validation.constraints.*;
import java.time.LocalDate;

public record UpdatePatientRequest(
        @NotBlank @Size(min = 2, max = 100) String fullName,
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Pattern(regexp = "[6-9][0-9]{9}", message = "must be a 10-digit Indian mobile number") String phone,
        @NotNull @Past LocalDate dateOfBirth,
        @NotBlank @Size(max = 500) String address,
        @NotNull @PositiveOrZero Long version
) {
    public UpdatePatientRequest {
        fullName = fullName == null ? null : fullName.strip();
        email = email == null ? null : email.strip().toLowerCase(java.util.Locale.ROOT);
        phone = phone == null ? null : phone.strip();
        address = address == null ? null : address.strip();
    }
}
