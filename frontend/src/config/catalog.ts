export const specialties = [
  {
    id: "general",
    label: "General physician",
    symbol: "✚",
    hint: "A good place to begin",
  },
  {
    id: "dental",
    label: "Dentist",
    symbol: "◇",
    hint: "Keep your smile healthy",
  },
  {
    id: "skin",
    label: "Dermatologist",
    symbol: "☀",
    hint: "Care for skin & hair",
  },
  {
    id: "pediatric",
    label: "Pediatrician",
    symbol: "✦",
    hint: "For your little ones",
  },
  {
    id: "gynecology",
    label: "Gynecologist",
    symbol: "◌",
    hint: "Care through every stage",
  },
  {
    id: "ent",
    label: "ENT specialist",
    symbol: "◎",
    hint: "Ear, nose & throat care",
  },
] as const;
export type SpecialtyId = (typeof specialties)[number]["id"];
export const locations = ["Rourkela", "Bengaluru", "Bhubaneswar"] as const;
export type City = (typeof locations)[number];
export const specialtyLabel = (id: SpecialtyId) =>
  specialties.find((s) => s.id === id)!.label;
export const clinicTimeZone = "Asia/Kolkata";
export const sessionStorageKey = "mediconnect.demo.appointments.v1";
