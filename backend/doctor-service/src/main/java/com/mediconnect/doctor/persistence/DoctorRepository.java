package com.mediconnect.doctor.persistence;
import com.mediconnect.doctor.domain.Doctor;
import java.util.*;
import org.springframework.data.jpa.repository.*;
public interface DoctorRepository extends JpaRepository<Doctor,UUID>,JpaSpecificationExecutor<Doctor> {
    Optional<Doctor> findByIdAndActiveTrue(UUID id);
}
