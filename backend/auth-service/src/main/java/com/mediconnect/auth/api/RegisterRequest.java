package com.mediconnect.auth.api;
import jakarta.validation.constraints.*;
import java.util.Locale;
public record RegisterRequest(@NotBlank @Email @Size(max=254) String email,
 @NotBlank @Size(min=12,max=72) String password, @Null String role) {
 public RegisterRequest { if(email!=null) email=email.strip().toLowerCase(Locale.ROOT); }
 @Override public String toString(){return "RegisterRequest[redacted]";}
}
