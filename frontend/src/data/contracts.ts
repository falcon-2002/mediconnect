import type { Doctor } from "../features/doctors/model";
import type {
  Appointment,
  BookingInput,
  Slot,
} from "../features/appointments/model";

// A future HTTP adapter will implement this boundary against the Spring Boot gateway.
export interface HealthcareRepository {
  listDoctors(): Promise<Doctor[]>;
  getDoctor(id: string): Promise<Doctor | undefined>;
  listSlots(doctorId: string): Promise<Slot[]>;
  listAppointments(): Promise<Appointment[]>;
  book(input: BookingInput): Promise<Appointment>;
  cancel(id: string): Promise<void>;
}
export interface AppointmentStorage {
  read(): Appointment[];
  write(appointments: Appointment[]): void;
}
