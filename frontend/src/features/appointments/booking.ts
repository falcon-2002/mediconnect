import { clinicDateKey } from "../../shared/date";
import { BookingError } from "./model";
import type { Appointment, BookingInput, Slot } from "./model";

// Clinic schedule uses explicit +05:30 offsets; it never depends on the browser timezone.
export function createSlots(
  doctorId: string,
  now = new Date(),
  days = 7,
): Slot[] {
  const result: Slot[] = [];
  const midnight = new Date(`${clinicDateKey(now)}T00:00:00+05:30`);
  for (let day = 1; day <= days; day++) {
    const dateKey = clinicDateKey(
      new Date(midnight.getTime() + day * 86_400_000),
    );
    for (const time of ["09:00", "09:30", "10:00", "11:00", "14:00", "15:30"]) {
      const start = new Date(`${dateKey}T${time}:00+05:30`);
      result.push({
        id: `${doctorId}:${dateKey}:${time}`,
        doctorId,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
      });
    }
  }
  return result;
}

export function reserveSlot(
  input: BookingInput,
  slots: readonly Slot[],
  appointments: readonly Appointment[],
  id: string,
  now = new Date(),
): Appointment {
  const patientName = input.patientName.trim();
  const phone = input.phone.trim();
  if (
    patientName.length < 2 ||
    patientName.length > 80 ||
    !/^[6-9]\d{9}$/.test(phone)
  ) {
    throw new BookingError(
      "INVALID_DETAILS",
      "Enter a name (2–80 characters) and a valid 10-digit Indian mobile number.",
    );
  }
  const slot = slots.find(
    (item) => item.id === input.slotId && item.doctorId === input.doctorId,
  );
  if (!slot)
    throw new BookingError(
      "INVALID_SLOT",
      "This slot is not offered by this doctor. Please choose another.",
    );
  if (new Date(slot.startsAt).getTime() <= now.getTime())
    throw new BookingError(
      "PAST_SLOT",
      "This appointment time has already passed.",
    );
  if (
    appointments.some(
      (item) =>
        item.doctorId === slot.doctorId &&
        item.startsAt === slot.startsAt &&
        item.status === "confirmed",
    )
  ) {
    throw new BookingError(
      "SLOT_TAKEN",
      "That time has just been booked. Please choose another slot.",
    );
  }
  return {
    ...input,
    patientName,
    phone,
    id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    status: "confirmed",
    createdAt: now.toISOString(),
  };
}

export function cancelBooking(
  appointments: readonly Appointment[],
  id: string,
): Appointment[] {
  if (!appointments.some((item) => item.id === id))
    throw new BookingError("NOT_FOUND", "Appointment not found.");
  return appointments.map((item) =>
    item.id === id ? { ...item, status: "cancelled" } : item,
  );
}
