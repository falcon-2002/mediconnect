package com.mediconnect.appointment.application;
import com.mediconnect.appointment.domain.*;
import com.mediconnect.appointment.persistence.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;
@Service
public class BookingTransactions {
 private final SlotRepository slots;private final AppointmentRepository appointments;private final Clock clock;
 public BookingTransactions(SlotRepository slots,AppointmentRepository appointments,Clock clock){this.slots=slots;this.appointments=appointments;this.clock=clock;}
 @Transactional public Appointment book(UUID slotId,UUID patientId,UUID accountId){
  Slot slot=slots.lock(slotId).orElseThrow(()->new ResponseStatusException(NOT_FOUND,"Slot not found"));
  if(!slot.startsAt.isAfter(clock.instant()))throw new ResponseStatusException(CONFLICT,"Slot has already started");
  if(slot.booked)throw new ResponseStatusException(CONFLICT,"Slot already booked");
  slot.booked=true;
  return appointments.saveAndFlush(new Appointment(slotId,patientId,accountId,clock.instant().truncatedTo(ChronoUnit.MICROS)));
 }
 @Transactional public Appointment cancel(UUID id,UUID accountId,boolean admin){
  Appointment first=appointments.findById(id).orElseThrow(()->new ResponseStatusException(NOT_FOUND,"Appointment not found"));
  if(!admin&&!first.accountId.equals(accountId))throw new ResponseStatusException(FORBIDDEN);
  Slot slot=slots.lock(first.slotId).orElseThrow();
  // Refresh after acquiring the shared slot lock: another cancellation may have committed.
  entityManager.refresh(first,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
  if(first.status.equals("CANCELLED"))return first;
  if(!slot.startsAt.isAfter(clock.instant()))throw new ResponseStatusException(CONFLICT,"Appointment has already started");
  first.status="CANCELLED";first.activeSlotId=null;first.cancelledAt=clock.instant().truncatedTo(ChronoUnit.MICROS);
  slot.booked=false;appointments.flush();return first;
 }
 @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager entityManager;
}
