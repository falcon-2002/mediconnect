import type { Doctor } from "../features/doctors/model";
export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}
export interface Catalog {
  specialties: Record<string, string>;
  cities: string[];
}
export interface Credentials {
  email: string;
  password: string;
}
export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}
export interface AccountResponse {
  id: string;
  email: string;
  role: string;
}
export interface PatientInput {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
}
export interface Patient extends PatientInput {
  id: string;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ApiSlot {
  id: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  booked: boolean;
}
export interface ApiAppointment {
  id: string;
  slotId: string;
  patientId: string;
  status: "BOOKED" | "CANCELLED";
  createdAt: string;
  cancelledAt: string | null;
}
export interface AppointmentView extends ApiAppointment {
  slot?: ApiSlot;
  doctor?: Doctor;
  detailsUnavailable: boolean;
}
