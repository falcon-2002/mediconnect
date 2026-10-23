package com.mediconnect.patient.api;

import com.mediconnect.patient.application.PatientService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@RestController
@RequestMapping("/api/patients")
@Tag(name = "Patients", description = "Local development patient-profile API")
public class PatientController {
    private final PatientService service;

    public PatientController(PatientService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "List active patients with bounded pagination")
    public PatientPage list(@RequestParam(defaultValue = "0") @Min(0) int page,
                            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(page, size);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Fetch one active patient")
    public PatientResponse get(@PathVariable UUID id) { return service.get(id); }

    @PostMapping
    @Operation(summary = "Create a patient")
    public ResponseEntity<PatientResponse> create(@Valid @RequestBody CreatePatientRequest request) {
        var response = service.create(request);
        var location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}")
                .buildAndExpand(response.id()).toUri();
        return ResponseEntity.created(location).body(response);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace profile details using the last-read version")
    public PatientResponse update(@PathVariable UUID id, @Valid @RequestBody UpdatePatientRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Deactivate a patient; retain its row and identity")
    public ResponseEntity<Void> deactivate(@PathVariable UUID id) {
        service.deactivate(id);
        return ResponseEntity.noContent().build();
    }
}
