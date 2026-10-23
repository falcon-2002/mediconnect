export interface Slot {
  id: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
}
export interface BookingInput {
  doctorId: string;
  slotId: string;
  patientName: string;
  phone: string;
}
export interface Appointment extends BookingInput {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "confirmed" | "cancelled";
  createdAt: string;
}
export class BookingError extends Error {
  constructor(
    public readonly code:
      | "INVALID_DETAILS"
      | "INVALID_SLOT"
      | "PAST_SLOT"
      | "SLOT_TAKEN"
      | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "BookingError";
  }
}
