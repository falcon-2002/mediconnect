import { useCallback, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useRepository } from "../../app/RepositoryProvider";
import { useCatalog } from "../../app/CatalogProvider";
import { useAsync } from "../../shared/useAsync";
import { Status } from "../../shared/Status";
import { Avatar } from "../../shared/Avatar";
import { formatDate, formatFee, formatTime } from "../../shared/date";
import { ApiError } from "../../data/httpClient";
export function BookingPage() {
  const { doctorId = "" } = useParams();
  const [params] = useSearchParams();
  const slotId = params.get("slot") || "";
  const repository = useRepository();
  const { label } = useCatalog();
  const navigate = useNavigate();
  const load = useCallback(async () => {
    const [doctor, slot, patient] = await Promise.all([
      repository.getDoctor(doctorId),
      slotId ? repository.getSlot(slotId) : undefined,
      repository.getMyPatient(),
    ]);
    return {
      doctor,
      patient,
      slot:
        slot?.doctorId === doctorId &&
        !slot.booked &&
        Date.parse(slot.startsAt) > Date.now()
          ? slot
          : undefined,
    };
  }, [repository, doctorId, slotId]);
  const state = useAsync(load);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const sending = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const doctor = state.data?.doctor,
    slot = state.data?.slot,
    patient = state.data?.patient;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!doctor || !slot || !patient || sending.current || uncertain) return;
    sending.current = true;
    setSubmitting(true);
    setError("");
    let succeeded = false;
    try {
      const booking = await repository.book({
        slotId: slot.id,
        patientId: patient.id,
      });
      succeeded = true;
      navigate(`/appointments?confirmed=${encodeURIComponent(booking.id)}`, {
        replace: true,
      });
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setError(
          "This time is no longer available, or the booking conflicts with the current record. Choose another available time.",
        );
        state.refresh();
      } else {
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not confirm the appointment.",
        );
        if (
          reason instanceof ApiError &&
          (reason.status === 0 || reason.status >= 500)
        )
          setUncertain(true);
      }
    } finally {
      if (!succeeded) {
        sending.current = false;
        setSubmitting(false);
      }
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {uncertain && (
        <p>
          <Link className="button secondary" to="/appointments">
            Check my appointments before trying again
          </Link>
        </p>
      )}
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
                  <span className="eyebrow">{label(doctor.specialty)}</span>
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
                Confirmation saves an appointment in MediConnect. No payment is
                collected and no real clinic is contacted.
              </p>
            </article>
            {patient ? (
              <form className="patient-form" onSubmit={submit}>
                <h2>Book for {patient.fullName}</h2>
                <p>{patient.phone}</p>
                <p>This booking is linked to your signed-in patient profile.</p>
                <button
                  className="button full"
                  disabled={submitting || uncertain}
                >
                  {submitting ? "Confirming…" : "Confirm appointment →"}
                </button>
              </form>
            ) : (
              <div className="patient-form">
                <h2>Complete your patient profile</h2>
                <p>We need your profile before your first booking.</p>
                <Link
                  className="button"
                  to={`/profile?next=${encodeURIComponent(`/book/${doctorId}?slot=${encodeURIComponent(slotId)}`)}`}
                >
                  Set up my profile
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="empty">
            <h2>This slot is no longer available.</h2>
            <p>It may have been booked, started, or the link may be invalid.</p>
            <Link className="button" to={`/doctors/${doctorId}`}>
              Choose another time
            </Link>
          </div>
        ))}
    </section>
  );
}
