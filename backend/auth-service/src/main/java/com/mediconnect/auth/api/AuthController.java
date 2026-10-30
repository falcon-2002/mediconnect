package com.mediconnect.auth.api;
import com.mediconnect.auth.application.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/auth")
public class AuthController {
 private final AuthService service;
 public AuthController(AuthService service){this.service=service;}
 @PostMapping("/register") @ResponseStatus(HttpStatus.CREATED)
 public AuthService.AccountResponse register(@Valid @RequestBody RegisterRequest request){return service.register(request);}
 @PostMapping("/login")
 public ResponseEntity<AuthService.TokenResponse> login(@Valid @RequestBody LoginRequest request){
  return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.login(request));
 }
}
