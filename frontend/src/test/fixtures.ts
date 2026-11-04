import type {
  ApiAppointment,
  ApiSlot,
  Catalog,
  Page,
  Patient,
  TokenResponse,
} from "../data/apiModels";
import type { Doctor } from "../features/doctors/model";
// Test-only fixtures; never imported by the live composition root.
export const doctor: Doctor = {
  id: "doctor-1",
  name: "Dr. Ananya Sen",
  specialty: "general",
  city: "Rourkela",
  area: "Demo Road",
  clinic: "Demo Clinic",
  qualifications: "MBBS",
  experienceYears: 8,
  feeInRupees: 500,
  languages: ["English"],
  about: "Fictional doctor for automated tests.",
  initials: "AS",
  color: "sage",
};
export const catalog: Catalog = {
  specialties: { general: "General physician", dental: "Dentist" },
  cities: ["Rourkela", "Bengaluru"],
};
export const patient: Patient = {
  id: "patient-a",
  fullName: "Test Patient A",
  email: "patient-a@example.test",
  phone: "9876543210",
  dateOfBirth: "1995-09-09",
  address: "Fictional street",
  active: true,
  version: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
export const slot: ApiSlot = {
  id: "slot-1",
  doctorId: doctor.id,
  startsAt: "2099-01-05T03:30:00Z",
  endsAt: "2099-01-05T04:00:00Z",
  booked: false,
};
export const appointment: ApiAppointment = {
  id: "appointment-1",
  slotId: slot.id,
  patientId: patient.id,
  status: "BOOKED",
  createdAt: "2026-11-01T00:00:00Z",
  cancelledAt: null,
};
export const pageOf = <T>(items: T[], page = 0, totalPages = 1): Page<T> => ({
  items,
  page,
  size: 12,
  totalItems: items.length,
  totalPages,
});
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
// Unsigned fixture for UI tests; Spring tests separately validate real RSA signatures.
export function tokenFor(
  subject = "account-a",
  role = "PATIENT",
  seconds = 900,
): TokenResponse {
  const encode = (v: unknown) =>
    btoa(JSON.stringify(v))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  return {
    accessToken: `${encode({ alg: "RS256" })}.${encode({ sub: subject, roles: [role], exp: Math.floor(Date.now() / 1000) + seconds })}.test-only`,
    tokenType: "Bearer",
    expiresIn: seconds,
  };
}
