// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import { RepositoryProvider } from "./RepositoryProvider";
import { createMockRepository } from "../data/mockRepository";
import { createMemoryStorage } from "../data/storage";

beforeEach(() => {
  window.scrollTo = vi.fn();
});
afterEach(cleanup);
function start(route: string) {
  const repository = createMockRepository(
    createMemoryStorage(),
    () => new Date("2026-10-13T13:00:00Z"),
    () => "demo-appointment",
  );
  render(
    <MemoryRouter initialEntries={[route]}>
      <RepositoryProvider repository={repository}>
        <App />
      </RepositoryProvider>
    </MemoryRouter>,
  );
  return { repository, user: userEvent.setup() };
}
describe("visitor journey", () => {
  it("finds a doctor, books a slot, sees confirmation, and cancels the appointment", async () => {
    const { repository, user } = start("/doctors?city=Rourkela");
    await user.click(
      await screen.findByRole("link", { name: "Dr. Ananya Sen" }),
    );
    await user.click(await screen.findByRole("link", { name: /^9:00/ }));
    await user.click(
      await screen.findByRole("button", { name: /Confirm demo appointment/ }),
    );
    expect(
      await screen.findByText("✓ Your demo appointment is confirmed."),
    ).toBeTruthy();
    expect((await repository.listAppointments())[0].status).toBe("confirmed");
    await user.click(
      screen.getByRole("button", { name: "Cancel appointment" }),
    );
    await user.click(screen.getByRole("button", { name: "Yes, cancel" }));
    expect(
      await screen.findByText(
        "Appointment cancelled. The slot is available again.",
      ),
    ).toBeTruthy();
    expect((await repository.listAppointments())[0].status).toBe("cancelled");
  });
  it("renders a useful empty search instead of disappearing content", async () => {
    start("/doctors?q=unfindable");
    expect(
      await screen.findByRole("heading", { name: "A wider search may help." }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Show all doctors" }),
    ).toBeTruthy();
  });
  it("handles unknown profiles and unavailable booking links", async () => {
    start("/book/ananya?slot=forged");
    expect(
      await screen.findByRole("heading", {
        name: "This slot is no longer available.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Choose another time" }),
    ).toBeTruthy();
  });
});
