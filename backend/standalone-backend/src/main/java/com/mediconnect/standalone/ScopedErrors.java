package com.mediconnect.standalone;

import java.time.Clock;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// Retain each existing error contract, scoped to its original controllers.
public final class ScopedErrors {
    private ScopedErrors() {}
    @RestControllerAdvice(basePackageClasses = com.mediconnect.auth.api.AuthController.class)
    static class AuthErrors extends com.mediconnect.auth.api.ApiExceptionHandler {}
    @RestControllerAdvice(basePackageClasses = com.mediconnect.patient.api.PatientController.class)
    static class PatientErrors extends com.mediconnect.patient.api.ApiExceptionHandler {
        PatientErrors(Clock clock) { super(clock); }
    }
    @RestControllerAdvice(basePackageClasses = com.mediconnect.doctor.api.DoctorController.class)
    static class DoctorErrors extends com.mediconnect.doctor.api.ApiExceptionHandler {
        DoctorErrors(Clock clock) { super(clock); }
    }
    @RestControllerAdvice(basePackageClasses = com.mediconnect.appointment.api.AppointmentController.class)
    static class AppointmentErrors extends com.mediconnect.appointment.api.ApiExceptionHandler {
        AppointmentErrors(Clock clock) { super(clock); }
    }
}
