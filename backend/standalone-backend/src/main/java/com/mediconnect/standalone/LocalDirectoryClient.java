package com.mediconnect.standalone;

import com.mediconnect.appointment.application.DirectoryClient;
import com.mediconnect.doctor.application.DoctorService;
import com.mediconnect.patient.application.PatientService;
import com.mediconnect.patient.application.PatientException;
import java.util.UUID;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;

/** Replace only the remote transport. Domain lookups and ownership checks stay
 * in the existing proxied services, each using its own transaction manager. */
@Component
public class LocalDirectoryClient extends DirectoryClient {
    private final DoctorService doctors;
    private final PatientService patients;
    private final JwtDecoder decoder;
    private final JwtAuthenticationConverter converter;
    public LocalDirectoryClient(DoctorService doctors, PatientService patients, JwtDecoder decoder,
            JwtAuthenticationConverter converter) {
        super(RestClient.builder(), "unused-in-process", "unused-in-process");
        this.doctors = doctors; this.patients = patients; this.decoder = decoder; this.converter = converter;
    }
    @Override public void doctor(UUID id) {
        try {
            if (!doctors.get(id).active()) throw new ResponseStatusException(CONFLICT, "Referenced profile is inactive");
        } catch (ResponseStatusException exception) { throw exception; }
        catch (RuntimeException exception) { throw new ResponseStatusException(SERVICE_UNAVAILABLE, "Directory service unavailable"); }
    }
    @Override public void patient(UUID id, String token) {
        var previous = SecurityContextHolder.getContext();
        try {
            if (token == null || token.isBlank()) throw new ResponseStatusException(UNAUTHORIZED);
            var context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(converter.convert(decoder.decode(token)));
            SecurityContextHolder.setContext(context);
            if (!patients.get(id).active()) throw new ResponseStatusException(CONFLICT, "Referenced profile is inactive");
        } catch (JwtException exception) { throw new ResponseStatusException(UNAUTHORIZED); }
        catch (AccessDeniedException exception) { throw new ResponseStatusException(FORBIDDEN, "Profile access denied"); }
        catch (PatientException exception) { throw new ResponseStatusException(NOT_FOUND, "Referenced profile not found"); }
        catch (ResponseStatusException exception) { throw exception; }
        catch (RuntimeException exception) { throw new ResponseStatusException(SERVICE_UNAVAILABLE, "Directory service unavailable"); }
        finally { SecurityContextHolder.setContext(previous); }
    }
}
