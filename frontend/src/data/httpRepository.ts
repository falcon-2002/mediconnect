import type { HealthcareRepository } from "./contracts";
import type {
  Page,
  ApiSlot,
  ApiAppointment,
  AppointmentView,
} from "./apiModels";
import { ApiError, type HttpClient } from "./httpClient";
const idPath = (id: string) => encodeURIComponent(id);
async function optional<T>(request: Promise<T>): Promise<T | undefined> {
  try {
    return await request;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined;
    throw e;
  }
}
export function createHttpRepository(http: HttpClient): HealthcareRepository {
  const repository: HealthcareRepository = {
    getCatalog: () => http("/api/doctors/catalog"),
    searchDoctors: (filters, page) => {
      const params = new URLSearchParams({
        query: filters.query,
        city: filters.city,
        specialty: filters.specialty,
        sort: filters.sort,
        page: String(page),
        size: "12",
      });
      if (filters.maxFee !== undefined)
        params.set("maxFee", String(filters.maxFee));
      return http(`/api/doctors?${params}`);
    },
    getDoctor: (id) => optional(http(`/api/doctors/${idPath(id)}`)),
    getSlot: (id) => optional(http(`/api/slots/${idPath(id)}`)),
    async listSlots(doctorId) {
      const from = new Date();
      const to = new Date(from.getTime() + 7 * 86400000);
      const slots: ApiSlot[] = [];
      // Fixed seven-day window contains at most 336 half-hour slots. Never invent availability.
      for (let page = 0; page < 4; page++) {
        const params = new URLSearchParams({
          doctorId,
          from: from.toISOString(),
          to: to.toISOString(),
          page: String(page),
          size: "100",
        });
        const result = await http<Page<ApiSlot>>(`/api/slots?${params}`);
        slots.push(...result.items);
        if (page + 1 >= result.totalPages) break;
      }
      return [
        ...new Map(
          slots
            .filter((s) => !s.booked && Date.parse(s.startsAt) > Date.now())
            .map((s) => [s.id, s]),
        ).values(),
      ];
    },
    register: (input) =>
      http("/api/auth/register", {
        method: "POST",
        body: { email: input.email, password: input.password },
      }),
    login: (input) =>
      http("/api/auth/login", {
        method: "POST",
        body: { email: input.email, password: input.password },
      }),
    getMyPatient: () =>
      optional(http("/api/patients/me", { authenticated: true })),
    createPatient: (input) =>
      http("/api/patients", {
        method: "POST",
        body: input,
        authenticated: true,
      }),
    book: (input) =>
      http("/api/appointments", {
        method: "POST",
        body: { slotId: input.slotId, patientId: input.patientId },
        authenticated: true,
      }),
    async listAppointments(page) {
      const result = await http<Page<ApiAppointment>>(
        `/api/appointments?page=${page}&size=10`,
        { authenticated: true },
      );
      // Bounded joins per page; deactivated doctors must not hide appointment history.
      const slots = new Map<string, Promise<ApiSlot | undefined>>();
      const doctors = new Map<
        string,
        ReturnType<HealthcareRepository["getDoctor"]>
      >();
      const items = await Promise.all(
        result.items.map(async (appointment): Promise<AppointmentView> => {
          try {
            if (!slots.has(appointment.slotId))
              slots.set(
                appointment.slotId,
                repository.getSlot(appointment.slotId),
              );
            const slot = await slots.get(appointment.slotId);
            if (slot && !doctors.has(slot.doctorId))
              doctors.set(slot.doctorId, repository.getDoctor(slot.doctorId));
            const doctor = slot ? await doctors.get(slot.doctorId) : undefined;
            return {
              ...appointment,
              slot,
              doctor,
              detailsUnavailable: !slot || !doctor,
            };
          } catch {
            return { ...appointment, detailsUnavailable: true };
          }
        }),
      );
      return { ...result, items };
    },
    cancel: (id) =>
      http(`/api/appointments/${idPath(id)}/cancel`, {
        method: "POST",
        authenticated: true,
      }),
  };
  return repository;
}
