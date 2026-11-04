export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  city: string;
  area: string;
  clinic: string;
  qualifications: string;
  experienceYears: number;
  feeInRupees: number;
  languages: string[];
  about: string;
  initials: string;
  color: "sage" | "sand" | "rose" | "sky";
}
export type DoctorSort = "name" | "fee" | "experience";
export interface SearchFilters {
  query: string;
  city: string;
  specialty: string;
  maxFee?: number;
  sort: DoctorSort;
}
