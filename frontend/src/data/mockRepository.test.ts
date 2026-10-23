import { describe, expect, it } from "vitest";
import { createMockRepository } from "./mockRepository";
import { createMemoryStorage, createSessionStorage } from "./storage";
import { sessionStorageKey } from "../config/catalog";

describe("repository boundary", () => {
  it("rejects one of two simultaneous submissions in the same repository session", async () => {
    const repository = createMockRepository(
      createMemoryStorage(),
      () => new Date("2026-10-13T13:00:00Z"),
      () => "test-id",
    );
    const slots = await repository.listSlots("ananya");
    const input = {
      doctorId: "ananya",
      slotId: slots[0].id,
      patientName: "Demo Patient",
      phone: "9876543210",
    };
    const results = await Promise.allSettled([
      repository.book(input),
      repository.book(input),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(await repository.listSlots("ananya")).toHaveLength(41);
    await repository.cancel("test-id");
    expect(await repository.listSlots("ananya")).toHaveLength(42);
  });
  it("preserves stored appointments when a repository instance is recreated", async () => {
    const storage = createMemoryStorage();
    const clock = () => new Date("2026-10-13T13:00:00Z");
    const first = createMockRepository(storage, clock, () => "test-id");
    const slot = (await first.listSlots("rohan"))[0];
    await first.book({
      doctorId: "rohan",
      slotId: slot.id,
      patientName: "Demo Patient",
      phone: "9876543210",
    });
    expect(
      await createMockRepository(storage, clock).listAppointments(),
    ).toHaveLength(1);
  });
  it("rejects unknown doctors and storage failures", async () => {
    const repository = createMockRepository(
      {
        read: () => [],
        write: () => {
          throw new Error("Storage unavailable");
        },
      },
      () => new Date("2026-10-13T13:00:00Z"),
    );
    await expect(repository.listSlots("missing")).rejects.toThrow(
      "Doctor not found",
    );
    const slot = (await repository.listSlots("ananya"))[0];
    await expect(
      repository.book({
        doctorId: "ananya",
        slotId: slot.id,
        patientName: "Demo Patient",
        phone: "9876543210",
      }),
    ).rejects.toThrow("Storage unavailable");
  });
  it("fails visibly instead of silently discarding malformed persisted data", () => {
    const values = new Map<string, string>();
    const storage: Storage = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
      clear: () => values.clear(),
      key: (index) => [...values.keys()][index] || null,
      get length() {
        return values.size;
      },
    };
    const adapter = createSessionStorage(storage);
    expect(adapter.read()).toEqual([]);
    storage.setItem(sessionStorageKey, "{broken");
    expect(() => adapter.read()).toThrow("damaged");
    storage.setItem(sessionStorageKey, '[{"id":"wrong"}]');
    expect(() => adapter.read()).toThrow("unsupported");
  });
});
