import { useCallback, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useRepository } from "../../app/RepositoryProvider";
import { useAsync } from "../../shared/useAsync";
import { Status } from "../../shared/Status";
import { formatDate, formatTime } from "../../shared/date";
import { Avatar } from "../../shared/Avatar";
import { Pagination } from "../../shared/Pagination";
export function AppointmentsPage() {
  const repository = useRepository();
  const [params, setParams] = useSearchParams();
  const confirmed = params.get("confirmed");
  const rawPage = Number(params.get("page") ?? 0);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 ? rawPage : 0;
  const state = useAsync(
    useCallback(() => repository.listAppointments(page), [repository, page]),
  );
  const [pendingCancel, setPendingCancel] = useState("");
  const [busy, setBusy] = useState("");
  const sending = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function cancel(id: string) {
    if (sending.current) return;
    sending.current = true;
    setBusy(id);
    setError("");
    try {
      await repository.cancel(id);
      setPendingCancel("");
      setNotice("Appointment cancelled. The slot is available again.");
      state.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not cancel.");
      state.refresh();
    } finally {
      sending.current = false;
      setBusy("");
    }
  }
  return (
    <section className="page-section">
      <div className="page-title">
        <span className="eyebrow">YOUR CARE, PLANNED</span>
        <h1>My appointments</h1>
        <p>Appointments saved to your patient account.</p>
      </div>
      {state.data?.items.some(
        (a) => a.id === confirmed && a.status === "BOOKED",
      ) && (
        <div className="success" role="status">
          <strong>✓ Your appointment is confirmed.</strong>
          <p>You can review it below. No real clinic has been contacted.</p>
        </div>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Status
        loading={state.loading}
        error={state.error}
        retry={state.refresh}
      />
      {!state.loading && !state.error && (
        <>
          <div className="appointment-list">
            {!state.data?.items.length && (
              <div className="empty">
                <h2>No appointments on this page.</h2>
                <p>Find a doctor and choose an appointment time.</p>
                <Link className="button" to="/doctors">
                  Explore doctors ↗
                </Link>
                <p>
                  <Link to="/profile">View or set up my profile</Link>
                </p>
              </div>
            )}
            {state.data?.items.map((appointment) => (
              <article className="appointment-card" key={appointment.id}>
                {appointment.doctor && <Avatar doctor={appointment.doctor} />}
                <div className="appointment-info">
                  <span
                    className={`badge ${appointment.status === "BOOKED" ? "confirmed" : "cancelled"}`}
                  >
                    {appointment.status === "BOOKED"
                      ? "confirmed"
                      : "cancelled"}
                  </span>
                  <h2>
                    {appointment.doctor?.name ?? "Doctor details unavailable"}
                  </h2>
                  {appointment.doctor && (
                    <p>
                      {appointment.doctor.clinic} · {appointment.doctor.city}
                    </p>
                  )}
                  {appointment.slot && (
                    <strong>
                      {formatDate(appointment.slot.startsAt)} ·{" "}
                      {formatTime(appointment.slot.startsAt)} IST
                    </strong>
                  )}
                  <p>Reference {appointment.id}</p>
                  {appointment.detailsUnavailable && (
                    <p className="muted">
                      Some visit details could not be loaded. Your appointment
                      record is still saved.
                    </p>
                  )}
                </div>
                {appointment.status === "BOOKED" &&
                  (!appointment.slot ||
                    Date.parse(appointment.slot.startsAt) > Date.now()) && (
                    <div className="cancel-actions">
                      {pendingCancel === appointment.id ? (
                        <>
                          <p>Cancel this appointment?</p>
                          <button
                            className="button danger"
                            disabled={Boolean(busy)}
                            onClick={() => void cancel(appointment.id)}
                          >
                            {busy === appointment.id
                              ? "Cancelling…"
                              : "Yes, cancel"}
                          </button>
                          <button
                            className="text-link"
                            disabled={Boolean(busy)}
                            onClick={() => setPendingCancel("")}
                          >
                            Keep appointment
                          </button>
                        </>
                      ) : (
                        <button
                          className="button secondary"
                          disabled={Boolean(busy)}
                          onClick={() => setPendingCancel(appointment.id)}
                        >
                          Cancel appointment
                        </button>
                      )}
                    </div>
                  )}
              </article>
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={state.data?.totalPages ?? 0}
            onChange={(p) => {
              setPendingCancel("");
              setParams({ page: String(p) });
            }}
          />
        </>
      )}
      <p className="muted">
        Dates and times are shown in India Standard Time. Started appointments
        cannot be cancelled.
      </p>
    </section>
  );
}
