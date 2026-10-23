import { clinicTimeZone } from "../config/catalog";

export function clinicDateKey(value: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: clinicTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: clinicTimeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
export const formatTime = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: clinicTimeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
export const formatFee = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
