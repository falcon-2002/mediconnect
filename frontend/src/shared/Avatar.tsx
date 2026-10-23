import type { Doctor } from "../features/doctors/model";
export function Avatar({
  doctor,
  large = false,
}: {
  doctor: Doctor;
  large?: boolean;
}) {
  return (
    <div
      className={`avatar ${doctor.color} ${large ? "large" : ""}`}
      aria-hidden="true"
    >
      <span>{doctor.initials}</span>
      <i>✚</i>
    </div>
  );
}
