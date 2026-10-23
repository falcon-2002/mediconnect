import { describe, expect, it } from "vitest";
import { createSlots, reserveSlot, cancelBooking } from "./booking";
import { clinicDateKey } from "../../shared/date";
import type { BookingInput } from "./model";

const now = new Date("2026-10-13T13:00:00Z");
const slots = createSlots("ananya", now);
const input: BookingInput = {
  doctorId: "ananya",
  slotId: slots[0].id,
  patientName: " Demo Patient ",
  phone: "9876543210",
};
describe("booking rules", () => {
  it("generates 7 days of 30-minute slots in clinic time, crossing year boundaries", () => {
    expect(slots).toHaveLength(42);
    expect(slots[0].startsAt).toBe("2026-10-14T03:30:00.000Z");
    expect(Date.parse(slots[0].endsAt) - Date.parse(slots[0].startsAt)).toBe(
      1_800_000,
    );
    expect(clinicDateKey(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
    expect(
      createSlots("ananya", new Date("2026-12-31T13:00:00Z"))[0].id,
    ).toContain("2027-01-01");
  });
  it("trims details and confirms a valid appointment", () => {
    expect(reserveSlot(input, slots, [], "a1", now)).toMatchObject({
      id: "a1",
      patientName: "Demo Patient",
      status: "confirmed",
    });
  });
  it("rejects invalid patient details", () => {
    expect(() =>
      reserveSlot({ ...input, patientName: " " }, slots, [], "a1", now),
    ).toThrow("Enter a name");
    expect(() =>
      reserveSlot({ ...input, phone: "12345" }, slots, [], "a1", now),
    ).toThrow("mobile");
  });
  it("rejects forged, mismatched, and past slots", () => {
    expect(() =>
      reserveSlot({ ...input, slotId: "forged" }, slots, [], "a1", now),
    ).toThrow("not offered");
    expect(() =>
      reserveSlot({ ...input, doctorId: "rohan" }, slots, [], "a1", now),
    ).toThrow("not offered");
    expect(() =>
      reserveSlot(input, slots, [], "a1", new Date(slots[0].startsAt)),
    ).toThrow("already passed");
  });
  it("rejects duplicate active appointments without changing existing data", () => {
    const first = reserveSlot(input, slots, [], "a1", now);
    const current = [first];
    expect(() => reserveSlot(input, slots, current, "a2", now)).toThrow(
      "just been booked",
    );
    expect(current).toEqual([first]);
  });
  it("releases a cancelled slot, preserves history, and makes cancellation idempotent", () => {
    const first = reserveSlot(input, slots, [], "a1", now);
    const cancelled = cancelBooking([first], "a1");
    expect(cancelled[0].status).toBe("cancelled");
    expect(first.status).toBe("confirmed");
    expect(reserveSlot(input, slots, cancelled, "a2", now).status).toBe(
      "confirmed",
    );
    expect(cancelBooking(cancelled, "a1")).toEqual(cancelled);
    expect(() => cancelBooking(cancelled, "missing")).toThrow("not found");
  });
});
