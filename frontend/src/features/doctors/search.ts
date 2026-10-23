import { specialtyLabel } from "../../config/catalog";
import type { Doctor, SearchFilters } from "./model";

export function searchDoctors(
  doctors: readonly Doctor[],
  filters: SearchFilters,
): Doctor[] {
  const words = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return doctors
    .filter((doctor) => {
      const text = [
        doctor.name,
        specialtyLabel(doctor.specialty),
        doctor.clinic,
        doctor.area,
        doctor.city,
      ]
        .join(" ")
        .toLowerCase();
      return (
        words.every((word) => text.includes(word)) &&
        (!filters.city || doctor.city === filters.city) &&
        (!filters.specialty || doctor.specialty === filters.specialty) &&
        (filters.maxFee === undefined || doctor.feeInRupees <= filters.maxFee)
      );
    })
    .sort((a, b) => {
      const primary =
        filters.sort === "fee"
          ? a.feeInRupees - b.feeInRupees
          : filters.sort === "experience"
            ? b.experienceYears - a.experienceYears
            : 0;
      return primary || a.name.localeCompare(b.name);
    });
}
