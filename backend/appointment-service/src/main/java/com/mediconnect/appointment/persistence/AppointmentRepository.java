package com.mediconnect.appointment.persistence;
import com.mediconnect.appointment.domain.Appointment;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.*;
public interface AppointmentRepository extends JpaRepository<Appointment,UUID> {
 Page<Appointment> findByAccountId(UUID accountId,Pageable page);
}
