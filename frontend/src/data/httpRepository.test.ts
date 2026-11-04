import { describe, expect, it, vi } from "vitest";
import { createHttpRepository } from "./httpRepository";
import { createHttpClient } from "./httpClient";
import { createSessionStore } from "../features/auth/session";
import {
  appointment,
  doctor,
  json,
  pageOf,
  slot,
  tokenFor,
} from "../test/fixtures";
function setup() {
  const store = createSessionStore();
  store.set(tokenFor());
  const transport = vi.fn<typeof fetch>();
  return {
    transport,
    repository: createHttpRepository(createHttpClient(store, transport)),
  };
}
describe("live repository contracts", () => {
  it("uses the selected UUID and a seven-day UTC range across IST midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T18:29:59Z"));
    try {
      const { transport, repository } = setup();
      const available = { ...slot, startsAt: "2026-11-03T19:00:00Z" };
      transport.mockResolvedValue(json(pageOf([
        available,
        { ...available, id: "booked", booked: true },
        { ...available, id: "past", startsAt: "2026-11-03T18:00:00Z" },
      ])));
      expect(await repository.listSlots(doctor.id)).toEqual([available]);
      const url = new URL(String(transport.mock.calls[0][0]), "http://localhost");
      expect(url.searchParams.get("doctorId")).toBe(doctor.id);
      expect(url.searchParams.get("from")).toBe("2026-11-03T18:29:59.000Z");
      expect(url.searchParams.get("to")).toBe("2026-11-10T18:29:59.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
  it("sends server filters and pagination", async () => {
    const { transport, repository } = setup();
    transport.mockResolvedValue(json(pageOf([doctor], 2, 4)));
    const result = await repository.searchDoctors(
      {
        query: "A & B",
        city: "Rourkela",
        specialty: "general",
        sort: "fee",
        maxFee: 700,
      },
      2,
    );
    const url = new URL(String(transport.mock.calls[0][0]), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      query: "A & B",
      city: "Rourkela",
      specialty: "general",
      sort: "fee",
      maxFee: "700",
      page: "2",
      size: "12",
    });
    expect(result.totalPages).toBe(4);
  });
  it("retrieves subsequent slot pages with the same range", async () => {
    const { transport, repository } = setup();
    transport
      .mockResolvedValueOnce(json(pageOf([slot], 0, 2)))
      .mockResolvedValueOnce(json(pageOf([{ ...slot, id: "slot-2" }], 1, 2)));
    expect(await repository.listSlots(doctor.id)).toHaveLength(2);
    const urls = transport.mock.calls.map(
      ([url]) => new URL(String(url), "http://localhost"),
    );
    expect(urls[1].searchParams.get("page")).toBe("1");
    expect(urls[1].searchParams.get("from")).toBe(
      urls[0].searchParams.get("from"),
    );
  });
  it("books using IDs only and never submits a role during registration", async () => {
    const { transport, repository } = setup();
    transport.mockResolvedValue(json(appointment, 201));
    await repository.book({ patientId: "patient-a", slotId: slot.id });
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({
      patientId: "patient-a",
      slotId: slot.id,
    });
    transport.mockResolvedValue(json({ id: "test", role: "PATIENT" }, 201));
    await repository.register({
      email: "test@example.test",
      password: "test-only-credentials",
    });
    expect(
      JSON.parse(String(transport.mock.calls[1][1]?.body)),
    ).not.toHaveProperty("role");
  });
  it("distinguishes a missing own profile from a service outage", async () => {
    const { transport, repository } = setup();
    transport
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json({}, 503));
    await expect(repository.getMyPatient()).resolves.toBeUndefined();
    await expect(repository.getMyPatient()).rejects.toMatchObject({
      status: 503,
    });
  });
  it("preserves appointments when a doctor was deactivated", async () => {
    const { transport, repository } = setup();
    transport
      .mockResolvedValueOnce(json(pageOf([appointment])))
      .mockResolvedValueOnce(json(slot))
      .mockResolvedValueOnce(json({}, 404));
    expect((await repository.listAppointments(0)).items[0]).toMatchObject({
      id: appointment.id,
      status: "BOOKED",
      slot,
      detailsUnavailable: true,
    });
  });
});
