import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDatabase, closeDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrate.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { FoodLogRepository } from "../src/repositories/food-log.repository.js";
import { GeminiUsageRepository } from "../src/repositories/gemini-usage.repository.js";
import dashboardHandler from "../api/dashboard.js";
import { sql } from "drizzle-orm";

describe("Admin Dashboard & Gemini Usage Tracking", () => {
  let userRepo: UserRepository;
  let foodRepo: FoodLogRepository;
  let usageRepo: GeminiUsageRepository;

  beforeAll(async () => {
    await runMigrations();
    userRepo = new UserRepository();
    foodRepo = new FoodLogRepository();
    usageRepo = new GeminiUsageRepository();

    const db = getDatabase();
    await db.execute(
      sql`DELETE FROM gemini_usage_logs WHERE user_id IN (7771, 7772, 7773);`,
    );
    await db.execute(
      sql`DELETE FROM food_logs WHERE user_id IN (7771, 7772, 7773);`,
    );
    await db.execute(sql`DELETE FROM users WHERE id IN (7771, 7772, 7773);`);
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.execute(
      sql`DELETE FROM gemini_usage_logs WHERE user_id IN (7771, 7772, 7773);`,
    );
    await db.execute(
      sql`DELETE FROM food_logs WHERE user_id IN (7771, 7772, 7773);`,
    );
    await db.execute(sql`DELETE FROM users WHERE id IN (7771, 7772, 7773);`);
    closeDatabase();
  });

  it("should record Gemini usage logs and aggregate daily stats for chart", async () => {
    await usageRepo.createLog({
      userId: 7771,
      type: "PHOTO",
      model: "gemini-3.5-flash-lite",
      status: "SUCCESS",
      durationMs: 1450,
    });

    await usageRepo.createLog({
      userId: 7771,
      type: "PHOTO",
      model: "gemini-3.5-flash-lite",
      status: "SUCCESS",
      durationMs: 1200,
    });

    await usageRepo.createLog({
      userId: 7772,
      type: "TEXT",
      model: "gemini-3.5-flash-lite",
      status: "SUCCESS",
      durationMs: 850,
    });

    const chartStats = await usageRepo.getDailyUsageStats(7);
    expect(chartStats).toHaveLength(7);

    const todayPoint = chartStats[chartStats.length - 1];
    expect(todayPoint.photoCalls).toBeGreaterThanOrEqual(2);
    expect(todayPoint.textCalls).toBeGreaterThanOrEqual(1);

    const totals = await usageRepo.getTotalStats();
    expect(totals.totalPhotoScans).toBeGreaterThanOrEqual(2);
    expect(totals.totalTextScans).toBeGreaterThanOrEqual(1);
    expect(totals.todayPhotoScans).toBeGreaterThanOrEqual(2);
  });

  it("should support paginated user listing with search", async () => {
    await userRepo.createOrUpdate({
      id: 7771,
      username: "alex_healthy",
      gender: "MALE",
      age: 27,
      height: 175,
      weight: 70,
      bmi: 22.9,
      dailyCalorieTarget: 2100,
      status: "ACTIVE",
    });

    await userRepo.createOrUpdate({
      id: 7772,
      username: "bella_fitness",
      gender: "FEMALE",
      age: 24,
      height: 165,
      weight: 55,
      bmi: 20.2,
      dailyCalorieTarget: 1700,
      status: "ACTIVE",
    });

    const paginated = await userRepo.getPaginatedUsers({ page: 1, limit: 1 });
    expect(paginated.users).toHaveLength(1);
    expect(paginated.limit).toBe(1);
    expect(paginated.total).toBeGreaterThanOrEqual(2);
    expect(paginated.totalPages).toBeGreaterThanOrEqual(2);

    const searched = await userRepo.getPaginatedUsers({
      search: "bella_fitness",
    });
    expect(searched.users.length).toBe(1);
    expect(searched.users[0].username).toBe("bella_fitness");
  });

  it("should support paginated food logs with user join and deleted filter", async () => {
    await foodRepo.create({
      userId: 7771,
      foodName: "Steak Daging Sapi",
      portionDescription: "200g",
      calories: 500,
      protein: 45,
      carbs: 0,
      fat: 32,
    });

    const secondLog = await foodRepo.create({
      userId: 7771,
      foodName: "Jus Alpukat",
      portionDescription: "1 gelas",
      calories: 220,
      protein: 2,
      carbs: 25,
      fat: 14,
    });

    // Soft delete second log
    await foodRepo.softDelete(secondLog.id, 7771);

    const activeLogs = await foodRepo.getPaginatedLogs({
      userId: 7771,
      isDeleted: false,
    });
    expect(activeLogs.logs).toHaveLength(1);
    expect(activeLogs.logs[0].foodName).toBe("Steak Daging Sapi");

    const deletedLogs = await foodRepo.getPaginatedLogs({
      userId: 7771,
      isDeleted: true,
    });
    expect(deletedLogs.logs).toHaveLength(1);
    expect(deletedLogs.logs[0].foodName).toBe("Jus Alpukat");
  });

  it("should authenticate and serve dashboard API endpoints", async () => {
    // 1. Invalid Login
    let resStatus = 0;
    let resBody: any = null;
    const mockRes = {
      status(code: number) {
        resStatus = code;
        return this;
      },
      json(data: any) {
        resBody = data;
        return this;
      },
    };

    await dashboardHandler(
      {
        method: "POST",
        query: { action: "login" },
        body: { username: "wronguser", password: "wrongpassword" },
      },
      mockRes,
    );
    expect(resStatus).toBe(401);
    expect(resBody.success).toBe(false);

    // 2. Valid Login
    const { getEnv } = await import("../src/config/env.js");
    const env = getEnv();
    await dashboardHandler(
      {
        method: "POST",
        query: { action: "login" },
        body: {
          username: env.DASHBOARD_USERNAME || "admin",
          password: env.DASHBOARD_PASSWORD || "admin123",
        },
      },
      mockRes,
    );
    expect(resStatus).toBe(200);
    expect(resBody.success).toBe(true);
    expect(resBody.token).toBeDefined();

    const validToken = resBody.token;

    // 3. Authenticated request for stats
    await dashboardHandler(
      {
        method: "GET",
        query: { action: "stats", days: 7 },
        headers: { authorization: `Bearer ${validToken}` },
      },
      mockRes,
    );
    expect(resStatus).toBe(200);
    expect(resBody.success).toBe(true);
    expect(resBody.data.kpi).toBeDefined();
    expect(resBody.data.chart).toHaveLength(7);

    // 4. Authenticated request for users
    await dashboardHandler(
      {
        method: "GET",
        query: { action: "users", page: 1, limit: 10 },
        headers: { authorization: `Bearer ${validToken}` },
      },
      mockRes,
    );
    expect(resStatus).toBe(200);
    expect(resBody.data.users).toBeDefined();

    // 5. Authenticated request for food logs
    await dashboardHandler(
      {
        method: "GET",
        query: { action: "food-logs", page: 1, limit: 10 },
        headers: { authorization: `Bearer ${validToken}` },
      },
      mockRes,
    );
    expect(resStatus).toBe(200);
    expect(resBody.data.logs).toBeDefined();
  });
});
