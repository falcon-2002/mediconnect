package com.mediconnect.appointment.api;
import java.util.UUID;
import jakarta.validation.constraints.NotNull;
public record BookAppointmentRequest(@NotNull UUID slotId,@NotNull UUID patientId) {}
