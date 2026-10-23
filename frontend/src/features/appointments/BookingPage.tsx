import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useRepository } from "../../app/RepositoryProvider";
import { useAsync } from "../../shared/useAsync";
import { Status } from "../../shared/Status";
import { Avatar } from "../../shared/Avatar";
import { formatDate, formatFee, formatTime } from "../../shared/date";
import { specialtyLabel } from "../../config/catalog";

export function BookingPage() {
  const { doctorId = "" } = useParams();
  const [params] = useSearchParams();
  const slotId = params.get("slot") || "";
  const repository = useRepository();
  const navigate = useNavigate();
  const load = useCallback(async () => {
    const doctor = await repository.getDoctor(doctorId);
    const slots = doctor ? await repository.listSlots(doctorId) : [];
    return { doctor, slot: slots.find((slot) => slot.id === slotId) };
  }, [repository, doctorId, slotId]);
  const state = useAsync(load);
  const [patientName, setPatientName] = useState("Demo Patient");
  const [phone, setPhone] = useState("9876543210");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const doctor = state.data?.doctor;
  const slot = state.data?.slot;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!doctor || !slot || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const booking = await repository.book({
        doctorId,
        slotId,
        patientName,
        phone,
      });
      navigate(`/appointments?confirmed=${encodeURIComponent(booking.id)}`, {
        replace: true,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not book. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <section className="page-section">
      <Link className="text-link" to={`/doctors/${doctorId}`}>
        ← Change date or time
      </Link>
      <div className="page-title">
        <span className="eyebrow">ONE LAST STEP</span>
        <h1>Make room for your health.</h1>
        <p>Review your visit and confirm the details.</p>
      </div>
      <Status
        loading={state.loading}
        error={state.error}
        retry={state.refresh}
      />
      {!state.loading &&
        !state.error &&
        (doctor && slot ? (
          <div className="checkout-grid">
            <article className="visit-summary">
              <div className="doctor-top">
                <Avatar doctor={doctor} />
                <div>
                  <span className="eyebrow">
                    {specialtyLabel(doctor.specialty)}
                  </span>
                  <h2>{doctor.name}</h2>
                  <p>{doctor.clinic}</p>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Date</dt>
                  <dd>{formatDate(slot.startsAt)}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{formatTime(slot.startsAt)} IST</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>
                    {doctor.area}, {doctor.city}
                  </dd>
                </div>
                <div>
                  <dt>Consultation fee</dt>
                  <dd>{formatFee(doctor.feeInRupees)}</dd>
                </div>
              </dl>
              <p className="booking-note">
                No payment or real appointment is made. This confirmation is
                saved only in this browser tab’s demo session.
              </p>
            </article>
            <form className="patient-form" onSubmit={submit}>
              <h2>Patient details</h2>
              <p>Use the sample details below or enter fictional details.</p>
              <label>
                Patient name
                <input
                  name="patientName"
                  autoComplete="off"
                  required
                  minLength={2}
                  maxLength={80}
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                />
              </label>
              <label>
                Mobile number
                <input
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  pattern="[6-9][0-9]{9}"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-describedby="phone-help"
                />
              </label>
              <small id="phone-help">
                10-digit Indian mobile format. No messages are sent.
              </small>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="button full" disabled={submitting}>
                {submitting ? "Confirming…" : "Confirm demo appointment →"}
              </button>
              <p className="muted">
                Please do not enter real health or contact information.
              </p>
            </form>
          </div>
        ) : (
          <div className="empty">
            <h2>This slot is no longer available.</h2>
            <p>It may have been booked or the link may be invalid.</p>
            <Link className="button" to={`/doctors/${doctorId}`}>
              Choose another time
            </Link>
          </div>
        ))}
    </section>
  );
}
