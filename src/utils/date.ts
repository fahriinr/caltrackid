import { DateTime } from "luxon";

export const DEFAULT_TIMEZONE = "Asia/Jakarta";

/**
 * Returns current DateTime object in the given timezone (default Asia/Jakarta).
 */
export function getNowInTimezone(zone: string = DEFAULT_TIMEZONE): DateTime {
  return DateTime.now().setZone(zone);
}

/**
 * Returns Date objects / ISO strings for start (00:00:00.000) and end (23:59:59.999) of today
 * in the specified timezone.
 */
export function getTodayBounds(zone: string = DEFAULT_TIMEZONE): {
  startDate: Date;
  endDate: Date;
  startIso: string;
  endIso: string;
  displayDate: string;
} {
  const now = DateTime.now().setZone(zone);
  const startOfDay = now.startOf("day");
  const endOfDay = now.endOf("day");
  const displayDate = now.setLocale("id-ID").toFormat("EEEE, dd MMMM yyyy");

  return {
    startDate: startOfDay.toJSDate(),
    endDate: endOfDay.toJSDate(),
    startIso: startOfDay.toUTC().toISO()!,
    endIso: endOfDay.toUTC().toISO()!,
    displayDate,
  };
}

/**
 * Formats a Date or ISO date string into readable local Indonesian time (e.g. 12:45 WIB).
 */
export function formatTimeInTimezone(
  dateOrIso: string | Date,
  zone: string = DEFAULT_TIMEZONE,
): string {
  let dt: DateTime;
  if (dateOrIso instanceof Date) {
    dt = DateTime.fromJSDate(dateOrIso).setZone(zone);
  } else {
    dt = DateTime.fromISO(dateOrIso).setZone(zone);
  }
  return dt.toFormat("HH:mm");
}
