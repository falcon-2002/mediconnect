import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useRepository } from "../../app/RepositoryProvider";
import { specialtyLabel } from "../../config/catalog";
import { Avatar } from "../../shared/Avatar";
import { Status } from "../../shared/Status";
import { useAsync } from "../../shared/useAsync";
import {
  clinicDateKey,
  formatDate,
  formatFee,
  formatTime,
} from "../../shared/date";

export function ProfilePage() {
  const { doctorId = "" } = useParams();
  const repository = useRepository();
  const load = useCallback(async () => {
    const doctor = await repository.getDoctor(doctorId);
    return {
      doctor,
      slots: doctor ? await repository.listSlots(doctorId) : [],
    };
  }, [repository, doctorId]);
  const state = useAsync(load);
  const [chosenDate, setChosenDate] = useState("");
  const doctor = state.data?.doctor;
  const slots = state.data?.slots || [];
  const dates = [...new Set(slots.map((slot) => clinicDateKey(slot.startsAt)))];
  const date = dates.includes(chosenDate) ? chosenDate : dates[0];
  return (
    <section className="page-section">
      <Link className="text-link" to="/doctors">
        ← Back to doctors
      </Link>
      <Status
        loading={state.loading}
        error={state.error}
        retry={state.refresh}
      />
      {!state.loading &&
        !state.error &&
        (!doctor ? (
          <div className="empty">
            <h1>Doctor not found</h1>
            <Link to="/doctors">Explore available doctors</Link>
          </div>
        ) : (
          <div className="profile-grid">
            <div>
              <div className="profile-heading">
                <Avatar doctor={doctor} large />
                <div>
                  <span className="eyebrow">
                    {specialtyLabel(doctor.specialty)}
                  </span>
                  <h1>{doctor.name}</h1>
                  <p>{doctor.qualifications}</p>
                  <span className="pill">
                    {doctor.experienceYears} years of experience
                  </span>
                </div>
              </div>
              <section className="profile-section">
                <h2>A little about the doctor</h2>
                <p>{doctor.about}</p>
                <h3>Languages spoken</h3>
                <div className="pills">
                  {doctor.languages.map((language) => (
                    <span className="pill" key={language}>
                      {language}
                    </span>
                  ))}
                </div>
              </section>
              <section className="profile-section">
                <span className="eyebrow">YOUR VISIT</span>
                <h2>{doctor.clinic}</h2>
                <p>
                  {doctor.area}, {doctor.city}
                </p>
                <p>In-clinic consultation · 30 minutes</p>
                <strong>
                  {formatFee(doctor.feeInRupees)} consultation fee
                </strong>
              </section>
              <p className="muted">
                This is a fictional doctor profile for the MediConnect learning
                demo.
              </p>
            </div>
            <aside className="booking-panel">
              <span className="eyebrow">LET’S MAKE TIME</span>
              <h2>Choose your appointment</h2>
              <p>All times shown in India Standard Time.</p>
              <div className="day-grid">
                {dates.map((item) => (
                  <button
                    key={item}
                    className={date === item ? "selected" : ""}
                    aria-pressed={date === item}
                    onClick={() => setChosenDate(item)}
                  >
                    {formatDate(`${item}T12:00:00+05:30`)}
                  </button>
                ))}
              </div>
              <h3>Available times</h3>
              <div className="slot-grid">
                {slots
                  .filter((slot) => clinicDateKey(slot.startsAt) === date)
                  .map((slot) => (
                    <Link
                      key={slot.id}
                      className="slot"
                      to={`/book/${doctor.id}?slot=${encodeURIComponent(slot.id)}`}
                    >
                      {formatTime(slot.startsAt)}
                    </Link>
                  ))}
              </div>
              {!slots.length && (
                <p>
                  No slots are available in the next seven days. Please check
                  another doctor.
                </p>
              )}
              <div className="booking-note">
                Choose a time to continue. No payment is collected in this demo.
              </div>
            </aside>
          </div>
        ))}
    </section>
  );
}
