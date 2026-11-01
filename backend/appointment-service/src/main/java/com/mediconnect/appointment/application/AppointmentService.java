package com.mediconnect.appointment.application;
import com.mediconnect.appointment.api.*;
import com.mediconnect.appointment.domain.*;
import com.mediconnect.appointment.persistence.*;
import java.time.*;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.data.domain.*;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;
@Service
public class AppointmentService {
 private final SlotRepository slots;private final AppointmentRepository appointments;private final BookingTransactions transactions;
 private final DirectoryClient directories;private final Clock clock;
 public AppointmentService(SlotRepository s,AppointmentRepository a,BookingTransactions t,DirectoryClient d,Clock c){slots=s;appointments=a;transactions=t;directories=d;clock=c;}
 public SlotResponse create(CreateSlotRequest r){
  if(r.startsAt().getNano()!=0||r.startsAt().getEpochSecond()%1800!=0||!r.startsAt().isAfter(clock.instant()))throw new ResponseStatusException(BAD_REQUEST,"Use a future UTC half-hour boundary");
  directories.doctor(r.doctorId());return SlotResponse.of(slots.saveAndFlush(new Slot(r.doctorId(),r.startsAt())));
 }
 public SlotResponse slot(UUID id){return SlotResponse.of(slots.findById(id).orElseThrow(()->new ResponseStatusException(NOT_FOUND,"Slot not found")));}
 public PageResponse<SlotResponse> slots(UUID doctor,Instant from,Instant to,int page,int size){
  if(!to.isAfter(from)||Duration.between(from,to).compareTo(Duration.ofDays(31))>0)throw new ResponseStatusException(BAD_REQUEST,"Use a date range up to 31 days");
  Instant start=from.isBefore(clock.instant())?clock.instant():from;
  return PageResponse.of(slots.findByDoctorIdAndBookedFalseAndStartsAtGreaterThanEqualAndStartsAtLessThan(doctor,start,to,paging(page,size,"startsAt")).map(SlotResponse::of));
 }
 public AppointmentResponse book(BookAppointmentRequest r,UUID account,String token){
  Slot s=slots.findById(r.slotId()).orElseThrow(()->new ResponseStatusException(NOT_FOUND,"Slot not found"));
  directories.patient(r.patientId(),token);directories.doctor(s.doctorId);
  return AppointmentResponse.of(transactions.book(r.slotId(),r.patientId(),account));
 }
 public AppointmentResponse get(UUID id,UUID account,boolean admin){
  var a=appointments.findById(id).orElseThrow(()->new ResponseStatusException(NOT_FOUND));
  if(!admin&&!a.accountId.equals(account))throw new ResponseStatusException(FORBIDDEN);
  return AppointmentResponse.of(a);
 }
 public PageResponse<AppointmentResponse> list(UUID account,boolean admin,int page,int size){
  var p=paging(page,size,"createdAt");return PageResponse.of((admin?appointments.findAll(p):appointments.findByAccountId(account,p)).map(AppointmentResponse::of));
 }
 public AppointmentResponse cancel(UUID id,UUID account,boolean admin){return AppointmentResponse.of(transactions.cancel(id,account,admin));}
 private Pageable paging(int page,int size,String field){if(page<0||size<1||size>100)throw new ResponseStatusException(BAD_REQUEST,"Invalid pagination");return PageRequest.of(page,size,Sort.by(field).and(Sort.by("id")));}
}
