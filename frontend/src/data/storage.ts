import { sessionStorageKey } from "../config/catalog";
import type { Appointment } from "../features/appointments/model";
import type { AppointmentStorage } from "./contracts";

function isAppointment(value: unknown): value is Appointment {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;
  return (
    [
      "id",
      "doctorId",
      "slotId",
      "patientName",
      "phone",
      "startsAt",
      "endsAt",
      "createdAt",
    ].every((key) => typeof a[key] === "string") &&
    ["confirmed", "cancelled"].includes(String(a.status)) &&
    ["startsAt", "endsAt", "createdAt"].every((key) =>
      Number.isFinite(Date.parse(String(a[key]))),
    )
  );
}

export function createSessionStorage(storage: Storage): AppointmentStorage {
  return {
    read() {
      const raw = storage.getItem(sessionStorageKey);
      if (!raw) return [];
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(
          "Demo appointment data is damaged. Clear this tab’s session storage to reset it.",
        );
      }
      if (!Array.isArray(parsed) || !parsed.every(isAppointment))
        throw new Error("Demo appointment data has an unsupported format.");
      return parsed;
    },
    write(appointments) {
      storage.setItem(sessionStorageKey, JSON.stringify(appointments));
    },
  };
}

export function createMemoryStorage(): AppointmentStorage {
  let values: Appointment[] = [];
  return {
    read: () => values.map((item) => ({ ...item })),
    write: (items) => {
      values = items.map((item) => ({ ...item }));
    },
  };
}
