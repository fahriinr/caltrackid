import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import { foodLogs, users, FoodLog, NewFoodLog } from "../db/schema.js";
import { randomUUID } from "crypto";

export interface DailySummary {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  logs: FoodLog[];
}

export interface FoodLogWithUser extends FoodLog {
  username?: string | null;
}

export interface PaginatedFoodLogsResult {
  logs: FoodLogWithUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class FoodLogRepository {
  async create(
    data: Omit<NewFoodLog, "id" | "loggedAt"> & { loggedAt?: Date },
  ): Promise<FoodLog> {
    const db = getDatabase();
    const id = randomUUID();
    const newEntry: NewFoodLog = {
      id,
      userId: data.userId,
      foodName: data.foodName,
      portionDescription: data.portionDescription ?? null,
      calories: data.calories,
      protein: data.protein ?? 0,
      carbs: data.carbs ?? 0,
      fat: data.fat ?? 0,
      confidenceNote: data.confidenceNote ?? null,
      isDeleted: false,
      loggedAt: data.loggedAt || new Date(),
    };

    const rows = await db.insert(foodLogs).values(newEntry).returning();
    return rows[0];
  }

  async findById(id: string): Promise<FoodLog | null> {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(foodLogs)
      .where(eq(foodLogs.id, id))
      .limit(1);
    return rows[0] || null;
  }

  async softDelete(id: string, userId: number): Promise<FoodLog | null> {
    const db = getDatabase();
    const rows = await db
      .update(foodLogs)
      .set({ isDeleted: true })
      .where(and(eq(foodLogs.id, id), eq(foodLogs.userId, userId)))
      .returning();
    return rows[0] || null;
  }

  async getLogsByDateRange(
    userId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<FoodLog[]> {
    const db = getDatabase();
    return db
      .select()
      .from(foodLogs)
      .where(
        and(
          eq(foodLogs.userId, userId),
          eq(foodLogs.isDeleted, false), // Only non-deleted logs
          gte(foodLogs.loggedAt, startDate),
          lte(foodLogs.loggedAt, endDate),
        ),
      );
  }

  async getDailySummary(
    userId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<DailySummary> {
    const logs = await this.getLogsByDateRange(userId, startDate, endDate);

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    for (const log of logs) {
      totalCalories += log.calories;
      totalProtein += log.protein;
      totalCarbs += log.carbs;
      totalFat += log.fat;
    }

    return {
      totalCalories,
      totalProtein: Math.round(totalProtein * 10) / 10,
      totalCarbs: Math.round(totalCarbs * 10) / 10,
      totalFat: Math.round(totalFat * 10) / 10,
      logs,
    };
  }

  async getPaginatedLogs(options: {
    page?: number;
    limit?: number;
    search?: string;
    isDeleted?: boolean;
    userId?: number;
  }): Promise<PaginatedFoodLogsResult> {
    const db = getDatabase();
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));
    const offset = (page - 1) * limit;
    const search = options.search?.trim();

    const conditions = [];

    if (options.isDeleted !== undefined) {
      conditions.push(eq(foodLogs.isDeleted, options.isDeleted));
    }

    if (options.userId !== undefined) {
      conditions.push(eq(foodLogs.userId, options.userId));
    }

    if (search) {
      conditions.push(
        or(
          ilike(foodLogs.foodName, `%${search}%`),
          ilike(foodLogs.portionDescription, `%${search}%`),
          sql`CAST(${foodLogs.userId} AS TEXT) LIKE ${`%${search}%`}`,
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(foodLogs)
      .where(whereClause);

    const total = countResult?.count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const rows = await db
      .select({
        id: foodLogs.id,
        userId: foodLogs.userId,
        foodName: foodLogs.foodName,
        portionDescription: foodLogs.portionDescription,
        calories: foodLogs.calories,
        protein: foodLogs.protein,
        carbs: foodLogs.carbs,
        fat: foodLogs.fat,
        confidenceNote: foodLogs.confidenceNote,
        isDeleted: foodLogs.isDeleted,
        loggedAt: foodLogs.loggedAt,
        username: users.username,
      })
      .from(foodLogs)
      .leftJoin(users, eq(foodLogs.userId, users.id))
      .where(whereClause)
      .orderBy(desc(foodLogs.loggedAt))
      .limit(limit)
      .offset(offset);

    return {
      logs: rows,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async countTotalStats(zone: string = "Asia/Jakarta"): Promise<{
    totalLogs: number;
    todayLogs: number;
    activeLogs: number;
  }> {
    const db = getDatabase();
    const [res] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(case when ${foodLogs.isDeleted} = false then 1 end)::int`,
        today: sql<number>`count(case when ${foodLogs.loggedAt} >= NOW() - INTERVAL '24 hours' then 1 end)::int`,
      })
      .from(foodLogs);

    return {
      totalLogs: res?.total || 0,
      todayLogs: res?.today || 0,
      activeLogs: res?.active || 0,
    };
  }
}

export const foodLogRepository = new FoodLogRepository();
