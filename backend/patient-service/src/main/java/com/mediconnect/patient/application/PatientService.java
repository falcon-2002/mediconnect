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

    public PatientService(PatientRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public PatientResponse get(UUID id) { return PatientResponse.from(requireActive(id)); }

    public PatientPage list(int page, int size) {
        var result = repository.findByActiveTrue(PageRequest.of(page, size,
                Sort.by("createdAt").descending().and(Sort.by("id"))));
        return new PatientPage(result.map(PatientResponse::from).getContent(),
                result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    @Transactional
    public PatientResponse create(CreatePatientRequest request) {
        if (repository.existsByEmail(request.email())) throw new PatientException(EMAIL_TAKEN);
        var patient = new Patient(request.fullName(), request.email(), request.phone(),
                request.dateOfBirth(), request.address(), Instant.now(clock));
        // Flush now so database constraint errors are translated before returning success.
        return PatientResponse.from(repository.saveAndFlush(patient));
    }

    @Transactional
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
