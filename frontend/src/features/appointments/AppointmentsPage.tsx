import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useRepository } from "../../app/RepositoryProvider";
import { useAsync } from "../../shared/useAsync";
import { Status } from "../../shared/Status";
import { formatDate, formatTime } from "../../shared/date";
import { Avatar } from "../../shared/Avatar";

export function AppointmentsPage() {
  const repository = useRepository();
  const [params] = useSearchParams();
  const confirmed = params.get("confirmed");
  const load = useCallback(
    async () => ({
      appointments: await repository.listAppointments(),
      doctors: await repository.listDoctors(),
    }),
    [repository],
  );
  const state = useAsync(load);
  const [pendingCancel, setPendingCancel] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function cancel(id: string) {
    setBusy(id);
    setError("");
    try {
      await repository.cancel(id);
      setPendingCancel("");
      setNotice("Appointment cancelled. The slot is available again.");
      state.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not cancel.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="page-section">
      <div className="page-title">
        <span className="eyebrow">YOUR CARE, PLANNED</span>
        <h1>My appointments</h1>
        <p>A little less to keep in your head.</p>
      </div>
      {state.data?.appointments.some(
        (a) => a.id === confirmed && a.status === "confirmed",
      ) && (
        <div className="success" role="status">
          <strong>✓ Your demo appointment is confirmed.</strong>
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
        <div className="appointment-list">
          {!state.data?.appointments.length && (
            <div className="empty">
              <h2>Your next visit starts here.</h2>
              <p>Find a doctor and choose an appointment time.</p>
              <Link className="button" to="/doctors">
                Explore doctors ↗
              </Link>
            </div>
          )}
          {state.data?.appointments.map((appointment) => {
            const doctor = state.data?.doctors.find(
              (item) => item.id === appointment.doctorId,
            );
            return (
              <article className="appointment-card" key={appointment.id}>
                {doctor && <Avatar doctor={doctor} />}
                <div className="appointment-info">
                  <span className={`badge ${appointment.status}`}>
                    {appointment.status}
                  </span>
                  <h2>{doctor?.name || "Doctor unavailable"}</h2>
                  <p>
                    {doctor?.clinic} · {doctor?.city}
                  </p>
                  <strong>
                    {formatDate(appointment.startsAt)} ·{" "}
                    {formatTime(appointment.startsAt)} IST
                  </strong>
                  <p>
                    For {appointment.patientName} · Reference{" "}
                    {appointment.id.slice(0, 8)}
                  </p>
                </div>
                {appointment.status === "confirmed" && (
                  <div className="cancel-actions">
                    {pendingCancel === appointment.id ? (
                      <>
                        <p>Cancel this demo appointment?</p>
                        <button
                          className="button danger"
                          disabled={busy === appointment.id}
                          onClick={() => void cancel(appointment.id)}
                        >
                          {busy ? "Cancelling…" : "Yes, cancel"}
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
                        onClick={() => setPendingCancel(appointment.id)}
                      >
                        Cancel appointment
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <p className="muted">
        Demo appointments belong to this tab’s session. They are not a real
        patient account.
      </p>
    </section>
  );
}
