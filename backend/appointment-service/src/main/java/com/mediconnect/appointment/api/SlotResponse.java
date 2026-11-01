package com.mediconnect.appointment.api;
import java.util.UUID;
import java.time.Instant;
import com.mediconnect.appointment.domain.Slot;
public record SlotResponse(UUID id,UUID doctorId,Instant startsAt,Instant endsAt,boolean booked){
 public static SlotResponse of(Slot s){return new SlotResponse(s.id,s.doctorId,s.startsAt,s.startsAt.plusSeconds(1800),s.booked);}
}
