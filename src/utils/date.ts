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

export interface DayInfo {
  date: Date;
  dayStart: Date;
  dayEnd: Date;
  dayName: string; // e.g. "Senin"
  dateFormatted: string; // e.g. "01/09"
  isToday: boolean;
}

/**
 * Returns bounds for the past 7 days (including today) ordered chronologically from oldest to newest.
 */
export function getPastSevenDays(zone: string = DEFAULT_TIMEZONE): {
  startDate: Date;
  endDate: Date;
  days: DayInfo[];
  displayRange: string;
} {
  const now = DateTime.now().setZone(zone);
  const days: DayInfo[] = [];

  // 6 days ago start to today end
  const startDate = now.minus({ days: 6 }).startOf("day").toJSDate();
  const endDate = now.endOf("day").toJSDate();

  for (let i = 6; i >= 0; i--) {
    const day = now.minus({ days: i });
    days.push({
      date: day.toJSDate(),
      dayStart: day.startOf("day").toJSDate(),
      dayEnd: day.endOf("day").toJSDate(),
      dayName: day.setLocale("id-ID").toFormat("EEEE"),
      dateFormatted: day.setLocale("id-ID").toFormat("dd MMM"),
      isToday: i === 0,
    });
  }

  const firstDayStr = now
    .minus({ days: 6 })
    .setLocale("id-ID")
    .toFormat("dd MMM");
  const todayStr = now.setLocale("id-ID").toFormat("dd MMM yyyy");
  const displayRange = `${firstDayStr} - ${todayStr}`;

  return {
    startDate,
    endDate,
    days,
    displayRange,
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
