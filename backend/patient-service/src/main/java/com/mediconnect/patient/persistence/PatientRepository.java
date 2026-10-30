package com.mediconnect.patient.persistence;

import com.mediconnect.patient.domain.Patient;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PatientRepository extends JpaRepository<Patient, UUID> {
    Optional<Patient> findByIdAndActiveTrue(UUID id);
    Page<Patient> findByActiveTrue(Pageable pageable);
    boolean existsByEmail(String email);
    boolean existsByIdAndAccountId(UUID id, UUID accountId);
    boolean existsByEmailAndIdNot(String email, UUID id);
}

