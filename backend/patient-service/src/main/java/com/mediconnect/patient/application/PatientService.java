package com.mediconnect.patient.application;

import com.mediconnect.patient.api.*;
import com.mediconnect.patient.domain.Patient;
import com.mediconnect.patient.persistence.PatientRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.mediconnect.patient.application.PatientException.Kind.*;

@Service
@Transactional(readOnly = true)
public class PatientService {
    private final PatientRepository repository;
    private final Clock clock;
    private final PatientAccess access;

    public PatientService(PatientRepository repository, Clock clock, PatientAccess access) {
        this.repository = repository;
        this.clock = clock;
        this.access = access;
    }

    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN') or (hasRole('PATIENT') and @patientAccess.owns(#id))")
    public PatientResponse get(UUID id) { return PatientResponse.from(requireActive(id)); }

    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    public PatientPage list(int page, int size) {
        var result = repository.findByActiveTrue(PageRequest.of(page, size,
                Sort.by("createdAt").descending().and(Sort.by("id"))));
        return new PatientPage(result.map(PatientResponse::from).getContent(),
                result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    @Transactional
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('PATIENT','ADMIN')")
    public PatientResponse create(CreatePatientRequest request) {
        if (repository.existsByEmail(request.email())) throw new PatientException(EMAIL_TAKEN);
        var patient = new Patient(request.fullName(), request.email(), request.phone(),
                request.dateOfBirth(), request.address(), Instant.now(clock));
        if (!access.isAdmin()) patient.assignAccount(access.accountId());
        // Flush now so database constraint errors are translated before returning success.
        return PatientResponse.from(repository.saveAndFlush(patient));
    }

    @Transactional
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN') or (hasRole('PATIENT') and @patientAccess.owns(#id))")
    public PatientResponse update(UUID id, UpdatePatientRequest request) {
        var patient = requireActive(id);
        if (patient.getVersion() != request.version()) throw new PatientException(STALE_VERSION);
        if (repository.existsByEmailAndIdNot(request.email(), id)) throw new PatientException(EMAIL_TAKEN);
        patient.update(request.fullName(), request.email(), request.phone(), request.dateOfBirth(),
                request.address(), Instant.now(clock));
        repository.flush(); // Dirty checking writes changes and checks @Version.
        return PatientResponse.from(patient);
    }

    @Transactional
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN') or (hasRole('PATIENT') and @patientAccess.owns(#id))")
    public void deactivate(UUID id) {
        var patient = repository.findById(id).orElseThrow(() -> new PatientException(NOT_FOUND));
        if (patient.isActive()) {
            patient.deactivate(Instant.now(clock));
            repository.flush();
        }
    }

    private Patient requireActive(UUID id) {
        return repository.findByIdAndActiveTrue(id).orElseThrow(() -> new PatientException(NOT_FOUND));
    }
}

