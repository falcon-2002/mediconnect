package com.mediconnect.appointment.api;
import com.mediconnect.appointment.application.AppointmentService;
import java.util.UUID;
import java.time.Instant;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
@RestController @RequestMapping("/api")
public class AppointmentController {
 private final AppointmentService service;
 public AppointmentController(AppointmentService service){this.service=service;}
 @PostMapping("/slots") @PreAuthorize("hasRole('ADMIN')")
 public ResponseEntity<SlotResponse> create(@Valid @RequestBody CreateSlotRequest r){var v=service.create(r);return ResponseEntity.created(ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}").buildAndExpand(v.id()).toUri()).body(v);}
 @GetMapping("/slots/{id}")
 public SlotResponse slot(@PathVariable UUID id){return service.slot(id);}
 @GetMapping("/slots")
 public PageResponse<SlotResponse> slots(@RequestParam UUID doctorId,@RequestParam Instant from,@RequestParam Instant to,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.slots(doctorId,from,to,page,size);}
 @PostMapping("/appointments") @PreAuthorize("hasRole('PATIENT')")
 public ResponseEntity<AppointmentResponse> book(@Valid @RequestBody BookAppointmentRequest r,JwtAuthenticationToken auth){var v=service.book(r,UUID.fromString(auth.getName()),auth.getToken().getTokenValue());return ResponseEntity.created(ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}").buildAndExpand(v.id()).toUri()).body(v);}
 @GetMapping("/appointments") @PreAuthorize("hasAnyRole('PATIENT','ADMIN')")
 public PageResponse<AppointmentResponse> list(Authentication auth,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.list(UUID.fromString(auth.getName()),admin(auth),page,size);}
 @GetMapping("/appointments/{id}") @PreAuthorize("hasAnyRole('PATIENT','ADMIN')")
 public AppointmentResponse get(@PathVariable UUID id,Authentication auth){return service.get(id,UUID.fromString(auth.getName()),admin(auth));}
 @PostMapping("/appointments/{id}/cancel") @PreAuthorize("hasAnyRole('PATIENT','ADMIN')")
 public AppointmentResponse cancel(@PathVariable UUID id,Authentication auth){return service.cancel(id,UUID.fromString(auth.getName()),admin(auth));}
 private boolean admin(Authentication a){return a.getAuthorities().stream().anyMatch(x->x.getAuthority().equals("ROLE_ADMIN"));}
}
