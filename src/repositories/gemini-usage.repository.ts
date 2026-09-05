import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import {
  geminiUsageLogs,
  GeminiUsageLog,
  NewGeminiUsageLog,
} from "../db/schema.js";
import { randomUUID } from "crypto";
import { DateTime } from "luxon";

export interface DailyUsagePoint {
  date: string; // YYYY-MM-DD
  dayLabel: string; // e.g. "01 Sep"
  photoCalls: number;
  textCalls: number;
  totalCalls: number;
  avgDurationMs: number;
}

export class GeminiUsageRepository {
  async createLog(
    data: Omit<NewGeminiUsageLog, "id" | "createdAt"> & { createdAt?: Date },
  ): Promise<GeminiUsageLog> {
    const db = getDatabase();
    const id = randomUUID();
    const newEntry: NewGeminiUsageLog = {
      id,
      userId: data.userId ?? null,
      type: data.type,
      model: data.model || "gemini-3.5-flash-lite",
      status: data.status || "SUCCESS",
      durationMs: data.durationMs || 0,
      errorMessage: data.errorMessage ?? null,
      createdAt: data.createdAt || new Date(),
    };

    const rows = await db.insert(geminiUsageLogs).values(newEntry).returning();
    return rows[0];
  }

  async getDailyUsageStats(
    daysCount: number = 14,
    zone: string = "Asia/Jakarta",
  ): Promise<DailyUsagePoint[]> {
    const db = getDatabase();
    const now = DateTime.now().setZone(zone);
    const startDate = now
      .minus({ days: daysCount - 1 })
      .startOf("day")
      .toJSDate();
    const endDate = now.endOf("day").toJSDate();

    const rawLogs = await db
      .select()
      .from(geminiUsageLogs)
      .where(
        and(
          gte(geminiUsageLogs.createdAt, startDate),
          lte(geminiUsageLogs.createdAt, endDate),
        ),
      );

    // Group by day in local timezone
    const map = new Map<
      string,
      { photo: number; text: number; totalDuration: number; count: number }
    >();

    // Prepopulate past N days so chart has continuous timeline
    const result: DailyUsagePoint[] = [];
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = now.minus({ days: i });
      const isoDate = d.toFormat("yyyy-MM-dd");
      map.set(isoDate, { photo: 0, text: 0, totalDuration: 0, count: 0 });
    }

    for (const log of rawLogs) {
      const dt = DateTime.fromJSDate(new Date(log.createdAt)).setZone(zone);
      const isoDate = dt.toFormat("yyyy-MM-dd");
      const current = map.get(isoDate) || {
        photo: 0,
        text: 0,
        totalDuration: 0,
        count: 0,
      };

      if (log.type === "PHOTO") {
        current.photo++;
      } else {
        current.text++;
      }
      current.totalDuration += log.durationMs || 0;
      current.count++;
      map.set(isoDate, current);
    }

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = now.minus({ days: i });
      const isoDate = d.toFormat("yyyy-MM-dd");
      const data = map.get(isoDate) || {
        photo: 0,
        text: 0,
        totalDuration: 0,
        count: 0,
      };
      const totalCalls = data.photo + data.text;
      const avgDurationMs =
        data.count > 0 ? Math.round(data.totalDuration / data.count) : 0;

      result.push({
        date: isoDate,
        dayLabel: d.setLocale("id-ID").toFormat("dd MMM"),
        photoCalls: data.photo,
        textCalls: data.text,
        totalCalls,
        avgDurationMs,
      });
    }

    return result;
  }

  async getTotalStats(): Promise<{
    totalPhotoScans: number;
    totalTextScans: number;
    totalCalls: number;
    todayPhotoScans: number;
    todayCalls: number;
  }> {
    const db = getDatabase();
    const now = DateTime.now().setZone("Asia/Jakarta");
    const todayStart = now.startOf("day").toJSDate();
    const todayEnd = now.endOf("day").toJSDate();

    const [totalStats] = await db
      .select({
        totalPhoto: sql<number>`count(case when ${geminiUsageLogs.type} = 'PHOTO' then 1 end)::int`,
        totalText: sql<number>`count(case when ${geminiUsageLogs.type} = 'TEXT' then 1 end)::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(geminiUsageLogs);

    const [todayStats] = await db
      .select({
        todayPhoto: sql<number>`count(case when ${geminiUsageLogs.type} = 'PHOTO' then 1 end)::int`,
        todayTotal: sql<number>`count(*)::int`,
      })
      .from(geminiUsageLogs)
      .where(
        and(
          gte(geminiUsageLogs.createdAt, todayStart),
          lte(geminiUsageLogs.createdAt, todayEnd),
        ),
      );

    return {
      totalPhotoScans: totalStats?.totalPhoto || 0,
      totalTextScans: totalStats?.totalText || 0,
      totalCalls: totalStats?.total || 0,
      todayPhotoScans: todayStats?.todayPhoto || 0,
      todayCalls: todayStats?.todayTotal || 0,
    };
  }

  /**
   * Returns count of successful photo scans by a specific user today (00:00 - 23:59 WIB)
   */
  async getUserTodayPhotoCount(
    userId: number,
    zone: string = "Asia/Jakarta",
  ): Promise<number> {
    const db = getDatabase();
    const now = DateTime.now().setZone(zone);
    const todayStart = now.startOf("day").toJSDate();
    const todayEnd = now.endOf("day").toJSDate();

    const [res] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(geminiUsageLogs)
      .where(
        and(
          eq(geminiUsageLogs.userId, userId),
          eq(geminiUsageLogs.type, "PHOTO"),
          eq(geminiUsageLogs.status, "SUCCESS"),
          gte(geminiUsageLogs.createdAt, todayStart),
          lte(geminiUsageLogs.createdAt, todayEnd),
        ),
      );

    return res?.count || 0;
  }

  /**
   * Returns count of total Gemini API calls across all users in the past 60 seconds
   */
  async getGlobalRecentMinuteCount(): Promise<number> {
    const db = getDatabase();
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    const [res] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(geminiUsageLogs)
      .where(gte(geminiUsageLogs.createdAt, oneMinuteAgo));

    return res?.count || 0;
  }

  /**
   * Returns count of total Gemini API calls across all users today
   */
  async getGlobalTodayCount(zone: string = "Asia/Jakarta"): Promise<number> {
    const db = getDatabase();
    const now = DateTime.now().setZone(zone);
    const todayStart = now.startOf("day").toJSDate();
    const todayEnd = now.endOf("day").toJSDate();

    const [res] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(geminiUsageLogs)
      .where(
        and(
          gte(geminiUsageLogs.createdAt, todayStart),
          lte(geminiUsageLogs.createdAt, todayEnd),
        ),
      );

    return res?.count || 0;
  }
}

export const geminiUsageRepository = new GeminiUsageRepository();
