package com.mediconnect.appointment.persistence;
import com.mediconnect.appointment.domain.Slot;
import java.util.*;
import java.time.Instant;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.*;
public interface SlotRepository extends JpaRepository<Slot,UUID> {
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select s from Slot s where s.id=:id")
 Optional<Slot> lock(@Param("id") UUID id);
 Page<Slot> findByDoctorIdAndBookedFalseAndStartsAtGreaterThanEqualAndStartsAtLessThan(UUID doctorId,Instant from,Instant to,Pageable page);
}
