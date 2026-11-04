import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "./httpClient";
import {
  createSessionStore,
  decodeSession,
  safeReturnTo,
} from "../features/auth/session";
import { json, tokenFor } from "../test/fixtures";
describe("HTTP and session boundary", () => {
  it("attaches a bearer only to private calls and disables cookies and caching", async () => {
    const store = createSessionStore();
    store.set(tokenFor());
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json({ ok: true }));
    const http = createHttpClient(store, transport);
    await http("/api/doctors");
    await http("/api/patients/me", { authenticated: true });
    expect(transport.mock.calls[0][1]?.headers).not.toHaveProperty(
      "Authorization",
    );
    expect(transport.mock.calls[1][1]).toMatchObject({
      headers: { Authorization: `Bearer ${store.getSnapshot()?.accessToken}` },
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    });
    await expect(http("https://untrusted.test/api")).rejects.toThrow(
      "Invalid API path",
    );
  });
  it("clears current sessions on 401 but preserves them on 403", async () => {
    const store = createSessionStore();
    store.set(tokenFor());
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 403))
      .mockResolvedValueOnce(json({}, 401));
    const http = createHttpClient(store, transport);
    await expect(
      http("/api/patients/me", { authenticated: true }),
    ).rejects.toMatchObject({ status: 403 });
    expect(store.getSnapshot()).not.toBeNull();
    await expect(
      http("/api/patients/me", { authenticated: true }),
    ).rejects.toMatchObject({ status: 401 });
    expect(store.getSnapshot()).toBeNull();
  });
  it("discards previous-session responses without signing out a new account", async () => {
    const store = createSessionStore();
    store.set(tokenFor("old-account"));
    let finish!: (response: Response) => void;
    const transport = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = createHttpClient(store, transport)("/api/patients/me", {
      authenticated: true,
    });
    store.set(tokenFor("new-account"));
    finish(json({}, 401));
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(store.getSnapshot()?.accountId).toBe("new-account");
  });
  it("rejects expired tokens before sending and never retries a failed write", async () => {
    const store = createSessionStore();
    store.set(tokenFor());
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("network"));
    const http = createHttpClient(store, transport);
    await expect(
      http("/api/appointments", {
        method: "POST",
        body: {},
        authenticated: true,
      }),
    ).rejects.toMatchObject({ status: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000000);
    await expect(
      http("/api/patients/me", { authenticated: true }),
    ).rejects.toMatchObject({ status: 401 });
    clock.mockRestore();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("sanitizes server errors and handles empty 204 responses", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("private SQL trace", { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const http = createHttpClient(createSessionStore(), transport);
    await expect(http("/api/doctors")).rejects.toThrow(
      "temporarily unavailable",
    );
    await expect(http("/api/doctors")).resolves.toBeUndefined();
  });
  it("validates session responses and limits return URLs to local patient pages", () => {
    expect(() =>
      decodeSession({
        accessToken: "bad",
        tokenType: "Bearer",
        expiresIn: 900,
      }),
    ).toThrow();
    for (const value of [
      "//evil.test",
      "https://evil.test",
      "/\\evil.test",
      "/login",
      "/register",
    ])
      expect(safeReturnTo(value)).toBe("/appointments");
    expect(safeReturnTo("/book/doctor-1?slot=slot-1")).toBe(
      "/book/doctor-1?slot=slot-1",
    );
    expect(createSessionStore().getSnapshot()).toBeNull();
  });
});
