package com.mediconnect.appointment.api;
import java.util.UUID;
import java.time.Instant;
import com.mediconnect.appointment.domain.Appointment;
public record AppointmentResponse(UUID id,UUID slotId,UUID patientId,String status,Instant createdAt,Instant cancelledAt){
 public static AppointmentResponse of(Appointment a){return new AppointmentResponse(a.id,a.slotId,a.patientId,a.status,a.createdAt,a.cancelledAt);}
}
