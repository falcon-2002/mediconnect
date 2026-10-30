package com.mediconnect.patient.application;
import com.mediconnect.patient.persistence.PatientRepository;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.security.core.context.SecurityContextHolder;
@Component("patientAccess")
public class PatientAccess {
 private final PatientRepository patients;
 public PatientAccess(PatientRepository patients){this.patients=patients;}
 public boolean isAdmin(){return SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream()
  .anyMatch(a->a.getAuthority().equals("ROLE_ADMIN"));}
 public UUID accountId(){return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());}
 public boolean owns(UUID id){return patients.existsByIdAndAccountId(id,accountId());}
}
