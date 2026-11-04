// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import { RepositoryProvider } from "./RepositoryProvider";
import { CatalogProvider } from "./CatalogProvider";
import { AuthProvider } from "../features/auth/AuthProvider";
import { createSessionStore } from "../features/auth/session";
import { createHttpClient } from "../data/httpClient";
import { createHttpRepository } from "../data/httpRepository";
import {
  appointment,
  catalog,
  doctor,
  json,
  pageOf,
  patient,
  slot,
  tokenFor,
} from "../test/fixtures";
beforeEach(() => {
  window.scrollTo = vi.fn();
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(cleanup);
function start(
  route: string,
  options: {
    signedIn?: boolean;
    hasProfile?: boolean;
    conflict?: boolean;
    searchEmpty?: boolean;
    unavailable?: boolean;
    role?: string;
    pages?: boolean;
    bookingNetworkFailure?: boolean;
    invalidLogin?: boolean;
    slotsEmpty?: boolean;
    sameNameDoctors?: boolean;
  } = {},
) {
  const session = createSessionStore();
  if (options.signedIn)
    session.set(tokenFor("account-a", options.role ?? "PATIENT"));
  let hasProfile = options.hasProfile ?? true;
  let booked = false,
    cancelled = false;
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/doctors/catalog") return json(catalog);
    if (url.pathname === "/api/auth/register")
      return json(
        { id: "account-a", email: "a@example.test", role: "PATIENT" },
        201,
      );
    if (url.pathname === "/api/auth/login")
      return options.invalidLogin ? json({}, 401) : json(tokenFor());
    if (url.pathname === "/api/doctors")
      return options.unavailable
        ? json({}, 503)
        : json(
            pageOf(
              options.searchEmpty
                ? []
                : options.sameNameDoctors
                  ? [doctor, { ...doctor, id: "doctor-2" }]
                  : [doctor],
              Number(url.searchParams.get("page") ?? 0),
              options.pages ? 3 : 1,
            ),
          );
    if (url.pathname === `/api/doctors/${doctor.id}`) return json(doctor);
    if (url.pathname === "/api/slots")
      return json(pageOf(options.slotsEmpty || (booked && !cancelled) ? [] : [slot]));
    if (url.pathname === `/api/slots/${slot.id}`)
      return json({ ...slot, booked: booked && !cancelled });
    if (url.pathname === "/api/patients/me")
      return hasProfile ? json(patient) : json({}, 404);
    if (url.pathname === "/api/patients" && method === "POST") {
      hasProfile = true;
      return json(patient, 201);
    }
    if (url.pathname === "/api/appointments" && method === "POST") {
      if (options.bookingNetworkFailure) throw new TypeError("network");
      if (options.conflict) {
        booked = true;
        return json({}, 409);
      }
      booked = true;
      return json(appointment, 201);
    }
    if (url.pathname === "/api/appointments")
      return json(
        pageOf(
          booked
            ? [{ ...appointment, status: cancelled ? "CANCELLED" : "BOOKED" }]
            : [],
        ),
      );
    if (url.pathname === `/api/appointments/${appointment.id}/cancel`) {
      cancelled = true;
      return json({ ...appointment, status: "CANCELLED" });
    }
    return json({}, 404);
  });
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider store={session}>
        <RepositoryProvider
          repository={createHttpRepository(
            createHttpClient(session, transport),
          )}
        >
          <CatalogProvider>
            <App />
          </CatalogProvider>
        </RepositoryProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
  return { session, transport, user: userEvent.setup() };
}
describe("patient journey through HTTP adapter", () => {
  it("shows the real empty slot state without creating booking links", async () => {
    start(`/doctors/${doctor.id}`, { slotsEmpty: true });
    expect(
      await screen.findByText(/No slots are available in the next seven days/),
    ).toBeTruthy();
    expect(document.querySelectorAll('a[href^="/book/"]')).toHaveLength(0);
  });
  it("keeps same-name doctors distinct by UUID without multiplying cards", async () => {
    start("/doctors", { sameNameDoctors: true });
    const links = await screen.findAllByRole("link", { name: doctor.name });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/doctors/${doctor.id}`,
      "/doctors/doctor-2",
    ]);
    expect(document.querySelectorAll(".doctor-card")).toHaveLength(2);
  });
  it("preserves public doctor cards after sign-out", async () => {
    const { user } = start("/doctors", { signedIn: true });
    await screen.findByRole("link", { name: doctor.name });
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: doctor.name })).toBeTruthy();
    expect(document.querySelectorAll(".doctor-card")).toHaveLength(1);
  });
  it("discovers, signs in, creates a profile, books once and cancels", async () => {
    const { user, transport } = start("/doctors?city=Rourkela", {
      hasProfile: false,
    });
    await user.click(await screen.findByRole("link", { name: doctor.name }));
    await user.click(await screen.findByRole("link", { name: /^9:00/ }));
    await user.type(await screen.findByLabelText("Email"), "a@example.test");
    await user.type(screen.getByLabelText("Password"), "test-only-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.click(
      await screen.findByRole("link", { name: "Set up my profile" }),
    );
    await user.type(
      await screen.findByLabelText("Full name"),
      patient.fullName,
    );
    await user.type(screen.getByLabelText("Contact email"), patient.email);
    await user.type(screen.getByLabelText("Mobile number"), patient.phone);
    await user.type(
      screen.getByLabelText("Date of birth"),
      patient.dateOfBirth,
    );
    await user.type(screen.getByLabelText("Address"), patient.address);
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await user.dblClick(
      await screen.findByRole("button", { name: /Confirm appointment/ }),
    );
    expect(
      await screen.findByText("✓ Your appointment is confirmed."),
    ).toBeTruthy();
    const bookings = transport.mock.calls.filter(
      ([url, init]) => url === "/api/appointments" && init?.method === "POST",
    );
    expect(bookings).toHaveLength(1);
    expect(JSON.parse(String(bookings[0][1]?.body))).toEqual({
      patientId: patient.id,
      slotId: slot.id,
    });
    await user.click(
      screen.getByRole("button", { name: "Cancel appointment" }),
    );
    await user.click(screen.getByRole("button", { name: "Yes, cancel" }));
    expect(
      await screen.findByText(
        "Appointment cancelled. The slot is available again.",
      ),
    ).toBeTruthy();
    expect(
      await screen.findByText("cancelled", { selector: ".badge" }),
    ).toBeTruthy();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeTruthy();
    expect(screen.queryByText(`Reference ${appointment.id}`)).toBeNull();
  });
  it("shows a booking conflict with refreshed availability, never a false confirmation", async () => {
    const { user } = start(`/book/${doctor.id}?slot=${slot.id}`, {
      signedIn: true,
      conflict: true,
    });
    await user.click(
      await screen.findByRole("button", { name: /Confirm appointment/ }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      await screen.findByRole("heading", {
        name: "This slot is no longer available.",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("✓ Your appointment is confirmed.")).toBeNull();
  });
  it("shows empty searches without falling back to demo doctors", async () => {
    start("/doctors?q=unfindable", { searchEmpty: true });
    expect(
      await screen.findByRole("heading", { name: "A wider search may help." }),
    ).toBeTruthy();
    expect(screen.queryByText(doctor.name)).toBeNull();
  });
  it("shows an unavailable backend instead of empty success", async () => {
    start("/doctors", { unavailable: true });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "A wider search may help." }),
    ).toBeNull();
  });
  it("redirects missing sessions and blocks non-patient accounts", async () => {
    start(`/book/${doctor.id}?slot=${slot.id}`);
    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeTruthy();
    cleanup();
    start("/appointments", { signedIn: true, role: "ADMIN" });
    expect(
      await screen.findByRole("heading", { name: "Patient account required" }),
    ).toBeTruthy();
  });
  it("registers without a role and then shows sign-in", async () => {
    const { user, transport } = start("/register");
    await user.type(await screen.findByLabelText("Email"), "new@example.test");
    await user.type(screen.getByLabelText("Password"), "test-only-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(
      await screen.findByText("Account created. Sign in to continue."),
    ).toBeTruthy();
    const request = transport.mock.calls.find(
      ([url]) => url === "/api/auth/register",
    );
    expect(JSON.parse(String(request?.[1]?.body))).not.toHaveProperty("role");
    expect(transport.mock.calls.some(([url]) => url === "/api/patients")).toBe(
      false,
    );
  });
  it("loads the profile from the backend in a new app session", async () => {
    const { transport } = start("/profile", { signedIn: true });
    expect(
      await screen.findByRole("heading", { name: patient.fullName }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        transport.mock.calls.some(([url]) => url === "/api/patients/me"),
      ).toBe(true),
    );
  });

  it("pages on the server and resets to page zero when a filter changes", async () => {
    const { user, transport } = start("/doctors", { pages: true });
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 3");
    await user.selectOptions(screen.getByLabelText("City"), "Rourkela");
    await screen.findByText("Page 1 of 3");
    const calls = transport.mock.calls
      .map(([url]) => new URL(String(url), "http://localhost"))
      .filter((url) => url.pathname === "/api/doctors");
    expect(calls.some((url) => url.searchParams.get("page") === "1")).toBe(
      true,
    );
    expect(calls.at(-1)?.searchParams.get("city")).toBe("Rourkela");
    expect(calls.at(-1)?.searchParams.get("page")).toBe("0");
  });
  it("does not retry ambiguous bookings and directs patients to their saved appointments", async () => {
    const { user, transport } = start(`/book/${doctor.id}?slot=${slot.id}`, {
      signedIn: true,
      bookingNetworkFailure: true,
    });
    await user.click(
      await screen.findByRole("button", { name: /Confirm appointment/ }),
    );
    expect(
      await screen.findByRole("link", {
        name: "Check my appointments before trying again",
      }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: /Confirm appointment/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      transport.mock.calls.filter(
        ([url, init]) => url === "/api/appointments" && init?.method === "POST",
      ),
    ).toHaveLength(1);
  });
  it("reports invalid credentials and clears the password field", async () => {
    const { user } = start("/login", { invalidLogin: true });
    await user.type(await screen.findByLabelText("Email"), "a@example.test");
    await user.type(
      screen.getByLabelText("Password"),
      "incorrect-test-password",
    );
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe(
      "",
    );
  });
  it("removes loaded patient details when a session ends", async () => {
    const { session } = start("/profile", { signedIn: true });
    await screen.findByText(patient.email);
    act(() => session.clear());
    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeTruthy();
    expect(screen.queryByText(patient.email)).toBeNull();
  });
});
