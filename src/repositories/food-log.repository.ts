import { and, eq, gte, lte } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import { foodLogs, FoodLog, NewFoodLog } from "../db/schema.js";
import { randomUUID } from "crypto";

export interface DailySummary {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  logs: FoodLog[];
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
}

export const foodLogRepository = new FoodLogRepository();
