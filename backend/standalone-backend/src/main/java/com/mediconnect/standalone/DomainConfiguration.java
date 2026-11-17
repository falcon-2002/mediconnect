package com.mediconnect.standalone;

import com.mediconnect.auth.api.AuthController;
import com.mediconnect.auth.application.AuthService;
import com.mediconnect.patient.api.PatientController;
import com.mediconnect.patient.application.PatientService;
import com.mediconnect.patient.application.PatientAccess;
import com.mediconnect.doctor.api.DoctorController;
import com.mediconnect.doctor.application.DoctorService;
import com.mediconnect.doctor.config.DoctorCatalog;
import com.mediconnect.appointment.api.AppointmentController;
import com.mediconnect.appointment.application.AppointmentService;
import com.mediconnect.appointment.application.BookingTransactions;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({DoctorCatalog.class, DatabaseProperties.class})
@Import({AuthController.class, AuthService.class, PatientController.class, PatientService.class,
        PatientAccess.class, DoctorController.class, DoctorService.class, AppointmentController.class,
        AppointmentService.class, BookingTransactions.class})
public class DomainConfiguration {
    @Bean Clock clock() { return Clock.systemUTC(); }
}
