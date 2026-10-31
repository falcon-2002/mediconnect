package com.mediconnect.doctor.api;
import com.mediconnect.doctor.application.DoctorService;
import com.mediconnect.doctor.config.DoctorCatalog;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.UUID;
import java.math.BigDecimal;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
@RestController @RequestMapping("/api/doctors")
public class DoctorController {
    private final DoctorService service; private final DoctorCatalog catalog;
    public DoctorController(DoctorService service,DoctorCatalog catalog){this.service=service;this.catalog=catalog;}
    @GetMapping("/catalog") public DoctorCatalog catalog(){return catalog;}
    @GetMapping public DoctorPage search(@RequestParam(defaultValue="") @Size(max=200) String query,
        @RequestParam(defaultValue="") @Size(max=80) String city,
        @RequestParam(defaultValue="") @Size(max=40) String specialty,
        @RequestParam(required=false) @DecimalMin("0") @DecimalMax("1000000") BigDecimal maxFee,
        @RequestParam(defaultValue="name") String sort,
        @RequestParam(defaultValue="0") @Min(0) int page,
        @RequestParam(defaultValue="20") @Min(1) @Max(100) int size){
        return service.search(query.strip(),city.strip(),specialty.strip(),maxFee,sort,page,size);
    }
    @GetMapping("/{id}") public DoctorResponse get(@PathVariable UUID id){return service.get(id);}
    @PostMapping @SecurityRequirement(name="bearerAuth")
    public ResponseEntity<DoctorResponse> create(@Valid @RequestBody CreateDoctorRequest request){
        var response=service.create(request);
        return ResponseEntity.created(ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}").buildAndExpand(response.id()).toUri()).body(response);
    }
    @PutMapping("/{id}") @SecurityRequirement(name="bearerAuth")
    public DoctorResponse update(@PathVariable UUID id,@Valid @RequestBody UpdateDoctorRequest request){return service.update(id,request);}
    @DeleteMapping("/{id}") @SecurityRequirement(name="bearerAuth")
    public ResponseEntity<Void> deactivate(@PathVariable UUID id){service.deactivate(id);return ResponseEntity.noContent().build();}
}
