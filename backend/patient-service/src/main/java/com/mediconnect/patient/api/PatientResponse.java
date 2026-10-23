package com.mediconnect.patient.api;

import com.mediconnect.patient.domain.Patient;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record PatientResponse(UUID id, String fullName, String email, String phone,
                              LocalDate dateOfBirth, String address, boolean active,
                              long version, Instant createdAt, Instant updatedAt) {
    public static PatientResponse from(Patient patient) {
        return new PatientResponse(patient.getId(), patient.getFullName(), patient.getEmail(),
                patient.getPhone(), patient.getDateOfBirth(), patient.getAddress(), patient.isActive(),
                patient.getVersion(), patient.getCreatedAt(), patient.getUpdatedAt());
    }
}
