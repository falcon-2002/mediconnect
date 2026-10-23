import { doctors } from "./doctors";
import type { AppointmentStorage, HealthcareRepository } from "./contracts";
import {
  cancelBooking,
  createSlots,
  reserveSlot,
} from "../features/appointments/booking";
import { BookingError } from "../features/appointments/model";

export function createMockRepository(
  storage: AppointmentStorage,
  clock = () => new Date(),
  nextId: () => string = () => crypto.randomUUID(),
): HealthcareRepository {
  const delay = () => new Promise((resolve) => setTimeout(resolve, 100));
  const requireDoctor = (id: string) => {
    if (!doctors.some((doctor) => doctor.id === id))
      throw new BookingError("NOT_FOUND", "Doctor not found.");
  };
  return {
    async listDoctors() {
      await delay();
      return structuredClone(doctors);
    },
    async getDoctor(id) {
      await delay();
      return structuredClone(doctors.find((doctor) => doctor.id === id));
    },
    async listSlots(doctorId) {
      await delay();
      requireDoctor(doctorId);
      const booked = storage
        .read()
        .filter((item) => item.status === "confirmed");
      return createSlots(doctorId, clock()).filter(
        (slot) =>
          !booked.some(
            (item) =>
              item.doctorId === doctorId && item.startsAt === slot.startsAt,
          ),
      );
    },
    async listAppointments() {
      await delay();
      return storage
        .read()
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },
    async book(input) {
      await delay();
      requireDoctor(input.doctorId);
      // Re-read immediately before the synchronous check/write: catches stale UI in this tab.
      const current = storage.read();
      const now = clock();
      const appointment = reserveSlot(
        input,
        createSlots(input.doctorId, now),
        current,
        nextId(),
        now,
      );
      storage.write([...current, appointment]);
      return appointment;
    },
    async cancel(id) {
      await delay();
      storage.write(cancelBooking(storage.read(), id));
    },
  };
}
