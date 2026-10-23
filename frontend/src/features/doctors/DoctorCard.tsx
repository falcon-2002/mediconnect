import { Link } from "react-router-dom";
import { specialtyLabel } from "../../config/catalog";
import { Avatar } from "../../shared/Avatar";
import { formatFee } from "../../shared/date";
import type { Doctor } from "./model";

export function DoctorCard({ doctor }: { doctor: Doctor }) {
  return (
    <article className="doctor-card">
      <div className="doctor-top">
        <Avatar doctor={doctor} />
        <div>
          <span className="eyebrow">{specialtyLabel(doctor.specialty)}</span>
          <h3>
            <Link to={`/doctors/${doctor.id}`}>{doctor.name}</Link>
          </h3>
          <p>{doctor.experienceYears} years of experience</p>
        </div>
      </div>
      <div className="clinic">
        <span aria-hidden="true">⌖</span>
        <div>
          <strong>{doctor.clinic}</strong>
          <p>
            {doctor.area}, {doctor.city}
          </p>
        </div>
      </div>
      <div className="card-bottom">
        <div>
          <strong>{formatFee(doctor.feeInRupees)}</strong>
          <span>Consultation fee</span>
        </div>
        <Link className="button secondary" to={`/doctors/${doctor.id}`}>
          View & book <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </article>
  );
}
