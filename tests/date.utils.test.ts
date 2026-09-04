import { describe, it, expect } from "vitest";
import { getTodayBounds, formatTimeInTimezone, getNowInTimezone } from "../src/utils/date.js";

describe("Date & Timezone Utilities", () => {
  it("should get today bounds in Asia/Jakarta correctly", () => {
    const bounds = getTodayBounds("Asia/Jakarta");

    expect(bounds.startIso).toBeDefined();
    expect(bounds.endIso).toBeDefined();
    expect(bounds.displayDate).toBeDefined();
    expect(new Date(bounds.startIso).getTime()).toBeLessThan(new Date(bounds.endIso).getTime());
  });

  it("should format time in Asia/Jakarta correctly", () => {
    // 2026-09-04T05:30:00Z is 12:30 in Asia/Jakarta (UTC+7)
    const formatted = formatTimeInTimezone("2026-09-04T05:30:00.000Z", "Asia/Jakarta");
    expect(formatted).toBe("12:30");
  });

  it("should return current DateTime in given timezone", () => {
    const dt = getNowInTimezone("Asia/Jakarta");
    expect(dt.zoneName).toBe("Asia/Jakarta");
  });
});
