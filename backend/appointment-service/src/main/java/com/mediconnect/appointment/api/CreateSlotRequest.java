package com.mediconnect.appointment.api;
import java.util.UUID;
import java.time.Instant;
import jakarta.validation.constraints.*;
public record CreateSlotRequest(@NotNull UUID doctorId,@NotNull @Future Instant startsAt) {}
