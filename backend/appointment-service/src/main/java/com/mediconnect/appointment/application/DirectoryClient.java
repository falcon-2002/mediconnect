package com.mediconnect.appointment.application;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.*;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;
@Component
public class DirectoryClient {
 private final RestClient client;private final String doctors,patients;
 public DirectoryClient(@Qualifier("serviceClient") RestClient.Builder builder,@Value("${services.doctor-url:http://DOCTOR-SERVICE}") String doctors,
 @Value("${services.patient-url:http://PATIENT-SERVICE}") String patients){this.client=builder.build();this.doctors=doctors;this.patients=patients;}
 public void doctor(UUID id){check(doctors+"/api/doctors/"+id,null);}
 public void patient(UUID id,String token){check(patients+"/api/patients/"+id,token);}
 private void check(String url,String token){
  try {
   var request=client.get().uri(url);if(token!=null)request.header("Authorization","Bearer "+token);
   var result=request.retrieve().body(DirectoryEntry.class);
   if(result==null||!result.active())throw new ResponseStatusException(CONFLICT,"Referenced profile is inactive");
  }catch(RestClientResponseException e){
   if(e.getStatusCode().value()==403)throw new ResponseStatusException(FORBIDDEN,"Profile access denied");
   if(e.getStatusCode().value()==401)throw new ResponseStatusException(UNAUTHORIZED);
   if(e.getStatusCode().value()==404)throw new ResponseStatusException(NOT_FOUND,"Referenced profile not found");
   throw new ResponseStatusException(SERVICE_UNAVAILABLE,"Directory service unavailable");
  }catch(RestClientException e){throw new ResponseStatusException(SERVICE_UNAVAILABLE,"Directory service unavailable");}
 }
 public record DirectoryEntry(boolean active){}
}
