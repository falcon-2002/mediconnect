import type { Doctor } from "../features/doctors/model";
import type {
  Appointment,
  BookingInput,
  Slot,
} from "../features/appointments/model";

// Original offline demo boundary retained only for isolated learning tests.
export interface DemoHealthcareRepository {
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

import type { SearchFilters } from "../features/doctors/model";
import type {
  Page,
  Catalog,
  Credentials,
  AccountResponse,
  TokenResponse,
  Patient,
  PatientInput,
  ApiSlot,
  ApiAppointment,
  AppointmentView,
} from "./apiModels";
export interface HealthcareRepository {
  getCatalog(): Promise<Catalog>;
  searchDoctors(filters: SearchFilters, page: number): Promise<Page<Doctor>>;
  getDoctor(id: string): Promise<Doctor | undefined>;
  listSlots(doctorId: string): Promise<ApiSlot[]>;
  getSlot(id: string): Promise<ApiSlot | undefined>;
  register(input: Credentials): Promise<AccountResponse>;
  login(input: Credentials): Promise<TokenResponse>;
  getMyPatient(): Promise<Patient | undefined>;
  createPatient(input: PatientInput): Promise<Patient>;
  book(input: { slotId: string; patientId: string }): Promise<ApiAppointment>;
  listAppointments(page: number): Promise<Page<AppointmentView>>;
  cancel(id: string): Promise<ApiAppointment>;
}
