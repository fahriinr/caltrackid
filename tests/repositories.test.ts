import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDatabase, closeDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrate.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { FoodLogRepository } from "../src/repositories/food-log.repository.js";
import { SessionRepository } from "../src/repositories/session.repository.js";
import { getTodayBounds } from "../src/utils/date.js";
import { sql } from "drizzle-orm";

describe("Database Repositories with PostgreSQL", () => {
  let userRepo: UserRepository;
  let foodRepo: FoodLogRepository;
  let sessionRepo: SessionRepository;

  beforeAll(async () => {
    await runMigrations();
    userRepo = new UserRepository();
    foodRepo = new FoodLogRepository();
    sessionRepo = new SessionRepository();
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.execute(
      sql`DELETE FROM food_logs WHERE user_id IN (123456, 1, 2, 100, 999);`,
    );
    await db.execute(
      sql`DELETE FROM user_sessions WHERE user_id IN (123456, 1, 2, 100, 999);`,
    );
    await db.execute(
      sql`DELETE FROM users WHERE id IN (123456, 1, 2, 100, 999);`,
    );
    closeDatabase();
  });

  beforeEach(async () => {
    const db = getDatabase();
    await db.execute(
      sql`DELETE FROM food_logs WHERE user_id IN (123456, 1, 2, 100, 999);`,
    );
    await db.execute(
      sql`DELETE FROM user_sessions WHERE user_id IN (123456, 1, 2, 100, 999);`,
    );
    await db.execute(
      sql`DELETE FROM users WHERE id IN (123456, 1, 2, 100, 999);`,
    );
  });

  describe("UserRepository", () => {
    it("should create and retrieve a user", async () => {
      const newUser = await userRepo.createOrUpdate({
        id: 123456,
        username: "testuser",
        gender: "MALE",
        age: 28,
        height: 175,
        weight: 70,
        bmi: 22.9,
        dailyCalorieTarget: 2100,
        status: "ACTIVE",
        timezone: "Asia/Jakarta",
      });

      expect(newUser.id).toBe(123456);
      expect(newUser.username).toBe("testuser");
      expect(newUser.dailyCalorieTarget).toBe(2100);

      const found = await userRepo.findById(123456);
      expect(found).not.toBeNull();
      expect(found?.gender).toBe("MALE");
    });

    it("should update user target calories", async () => {
      await userRepo.createOrUpdate({
        id: 123456,
        username: "testuser",
        gender: "MALE",
        age: 28,
        height: 175,
        weight: 70,
        bmi: 22.9,
        dailyCalorieTarget: 2000,
        status: "ACTIVE",
        timezone: "Asia/Jakarta",
      });

      const updated = await userRepo.updateTarget(123456, 1850);
      expect(updated?.dailyCalorieTarget).toBe(1850);
    });

    it("should list only active users", async () => {
      await userRepo.createOrUpdate({
        id: 1,
        gender: "MALE",
        age: 25,
        height: 170,
        weight: 65,
        bmi: 22.5,
        dailyCalorieTarget: 2000,
        status: "ACTIVE",
      });

      await userRepo.createOrUpdate({
        id: 2,
        gender: "FEMALE",
        age: 30,
        height: 160,
        weight: 55,
        bmi: 21.5,
        dailyCalorieTarget: 1600,
        status: "INACTIVE",
      });

      const active = await userRepo.listActiveUsers();
      const testActive = active.filter((u) => u.id === 1 || u.id === 2);
      expect(testActive).toHaveLength(1);
      expect(testActive[0].id).toBe(1);
    });
  });

  describe("FoodLogRepository", () => {
    it("should create food logs and compute daily summary", async () => {
      await userRepo.createOrUpdate({
        id: 100,
        gender: "MALE",
        age: 25,
        height: 170,
        weight: 65,
        bmi: 22.5,
        dailyCalorieTarget: 2000,
        status: "ACTIVE",
      });

      await foodRepo.create({
        userId: 100,
        foodName: "Nasi Goreng Spesial",
        portionDescription: "1 porsi sedang dengan telur ceplok",
        calories: 550,
        protein: 18,
        carbs: 65,
        fat: 20,
        confidenceNote: "Standar nasi goreng Indonesia",
      });

      await foodRepo.create({
        userId: 100,
        foodName: "Ayam Dada Panggang",
        portionDescription: "150 gram",
        calories: 250,
        protein: 35,
        carbs: 0,
        fat: 8,
        confidenceNote: "Dada ayam tanpa kulit",
      });

      const bounds = getTodayBounds("Asia/Jakarta");
      const summary = await foodRepo.getDailySummary(
        100,
        bounds.startDate,
        bounds.endDate,
      );

      expect(summary.totalCalories).toBe(800);
      expect(summary.totalProtein).toBe(53);
      expect(summary.totalCarbs).toBe(65);
      expect(summary.totalFat).toBe(28);
      expect(summary.logs).toHaveLength(2);
      expect(summary.logs[0].foodName).toBe("Nasi Goreng Spesial");
    });

    it("should soft delete a food log and exclude it from daily summary", async () => {
      await userRepo.createOrUpdate({
        id: 100,
        gender: "MALE",
        age: 25,
        height: 170,
        weight: 65,
        bmi: 22.5,
        dailyCalorieTarget: 2000,
        status: "ACTIVE",
      });

      const log = await foodRepo.create({
        userId: 100,
        foodName: "Snack Keripik",
        portionDescription: "1 bungkus",
        calories: 300,
        protein: 2,
        carbs: 35,
        fat: 15,
      });

      const bounds = getTodayBounds("Asia/Jakarta");
      let summary = await foodRepo.getDailySummary(
        100,
        bounds.startDate,
        bounds.endDate,
      );
      expect(summary.totalCalories).toBe(300);

      // Perform soft delete
      const deleted = await foodRepo.softDelete(log.id, 100);
      expect(deleted?.isDeleted).toBe(true);

      // Re-check summary: should now exclude the deleted food log
      summary = await foodRepo.getDailySummary(
        100,
        bounds.startDate,
        bounds.endDate,
      );
      expect(summary.totalCalories).toBe(0);
      expect(summary.logs).toHaveLength(0);
    });
  });

  describe("SessionRepository", () => {
    it("should manage session state and tempData accurately", async () => {
      const initial = await sessionRepo.getSession(999);
      expect(initial.step).toBe("IDLE");
      expect(initial.tempData).toBeNull();

      await sessionRepo.setSession(999, {
        step: "ONBOARDING_AGE",
        tempData: { gender: "MALE" },
      });

      let updated = await sessionRepo.getSession(999);
      expect(updated.step).toBe("ONBOARDING_AGE");
      expect(updated.tempData?.gender).toBe("MALE");

      await sessionRepo.setSession(999, {
        step: "ONBOARDING_HEIGHT",
        tempData: { gender: "MALE", age: 26 },
      });

      updated = await sessionRepo.getSession(999);
      expect(updated.step).toBe("ONBOARDING_HEIGHT");
      expect(updated.tempData?.age).toBe(26);

      await sessionRepo.clearSession(999);
      const cleared = await sessionRepo.getSession(999);
      expect(cleared.step).toBe("IDLE");
      expect(cleared.tempData).toBeNull();
      expect(cleared.pendingPhotoId).toBeNull();
    });
  });
});
