import { describe, it, expect } from "vitest";
import {
  getTodayBounds,
  getPastSevenDays,
  formatTimeInTimezone,
  getNowInTimezone,
} from "../src/utils/date.js";

describe("Date & Timezone Utilities", () => {
  it("should get today bounds in Asia/Jakarta correctly", () => {
    const bounds = getTodayBounds("Asia/Jakarta");

    expect(bounds.startIso).toBeDefined();
    expect(bounds.endIso).toBeDefined();
    expect(bounds.displayDate).toBeDefined();
    expect(new Date(bounds.startIso).getTime()).toBeLessThan(
      new Date(bounds.endIso).getTime(),
    );
  });

  it("should get past 7 days bounds and array of 7 days correctly", () => {
    const { startDate, endDate, days, displayRange } =
      getPastSevenDays("Asia/Jakarta");

    expect(days).toHaveLength(7);
    expect(startDate.getTime()).toBeLessThan(endDate.getTime());
    expect(displayRange).toBeDefined();

    // The last item must be today
    expect(days[6].isToday).toBe(true);
    expect(days[0].isToday).toBe(false);
  });

  it("should format time in Asia/Jakarta correctly", () => {
    // 2026-09-04T05:30:00Z is 12:30 in Asia/Jakarta (UTC+7)
    const formatted = formatTimeInTimezone(
      "2026-09-04T05:30:00.000Z",
      "Asia/Jakarta",
    );
    expect(formatted).toBe("12:30");
  });

  it("should return current DateTime in given timezone", () => {
    const dt = getNowInTimezone("Asia/Jakarta");
    expect(dt.zoneName).toBe("Asia/Jakarta");
  });
});
