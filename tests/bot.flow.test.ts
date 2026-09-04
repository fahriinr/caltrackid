import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { runMigrations } from "../src/db/migrate.js";
import { closeDatabase, getDatabase } from "../src/db/index.js";
import { userRepository } from "../src/repositories/user.repository.js";
import { foodLogRepository } from "../src/repositories/food-log.repository.js";
import { runDailyRecap } from "../src/cron/recap.cron.js";
import { Bot } from "grammy";
import { sql } from "drizzle-orm";

describe("Bot Daily Recap & Workflows", () => {
  beforeAll(async () => {
    await runMigrations();
    const db = getDatabase();
    await db.execute(
      sql`DELETE FROM food_logs WHERE user_id IN (555001, 555002);`,
    );
    await db.execute(
      sql`DELETE FROM user_sessions WHERE user_id IN (555001, 555002);`,
    );
    await db.execute(sql`DELETE FROM users WHERE id IN (555001, 555002);`);
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.execute(
      sql`DELETE FROM food_logs WHERE user_id IN (555001, 555002);`,
    );
    await db.execute(
      sql`DELETE FROM user_sessions WHERE user_id IN (555001, 555002);`,
    );
    await db.execute(sql`DELETE FROM users WHERE id IN (555001, 555002);`);
    closeDatabase();
  });

  it("should send daily recap message for user within budget", async () => {
    // 1. Create active user
    await userRepository.createOrUpdate({
      id: 555001,
      username: "healthy_user",
      gender: "MALE",
      age: 26,
      height: 172,
      weight: 68,
      bmi: 23.0,
      dailyCalorieTarget: 2000,
      status: "ACTIVE",
      timezone: "Asia/Jakarta",
    });

    // 2. Log food
    await foodLogRepository.create({
      userId: 555001,
      foodName: "Salad Buah & Dada Ayam",
      portionDescription: "1 porsi",
      calories: 450,
      protein: 30,
      carbs: 40,
      fat: 10,
      confidenceNote: "Sehat dan seimbang",
    });

    const sentMessages: { chatId: number; text: string }[] = [];

    const mockBot = {
      api: {
        sendMessage: vi.fn(async (chatId: number, text: string) => {
          sentMessages.push({ chatId, text });
          return {} as any;
        }),
      },
    } as unknown as Bot;

    await runDailyRecap(mockBot);

    expect(mockBot.api.sendMessage).toHaveBeenCalled();
    expect(sentMessages.length).toBeGreaterThanOrEqual(1);

    const userMessage = sentMessages.find((m) => m.chatId === 555001);
    expect(userMessage).toBeDefined();
    expect(userMessage?.text).toContain("REKAP MALAM NUTRIBOT");
    expect(userMessage?.text).toContain("450 kkal");
    expect(userMessage?.text).toContain("2000 kkal");
    expect(userMessage?.text).toContain("Salad Buah & Dada Ayam");
  });

  it("should send daily recap warning for user who exceeded target", async () => {
    await userRepository.createOrUpdate({
      id: 555002,
      username: "over_user",
      gender: "FEMALE",
      age: 28,
      height: 160,
      weight: 60,
      bmi: 23.4,
      dailyCalorieTarget: 1500,
      status: "ACTIVE",
      timezone: "Asia/Jakarta",
    });

    await foodLogRepository.create({
      userId: 555002,
      foodName: "Pizza & Burger Combo",
      portionDescription: "2 porsi besar",
      calories: 1900,
      protein: 60,
      carbs: 180,
      fat: 80,
      confidenceNote: "Kalori tinggi",
    });

    const sentMessages: { chatId: number; text: string }[] = [];
    const mockBot = {
      api: {
        sendMessage: vi.fn(async (chatId: number, text: string) => {
          sentMessages.push({ chatId, text });
          return {} as any;
        }),
      },
    } as unknown as Bot;

    await runDailyRecap(mockBot);

    const userMessage = sentMessages.find((m) => m.chatId === 555002);
    expect(userMessage).toBeDefined();
    expect(userMessage?.text).toContain("Asupan Melebihi Target");
    expect(userMessage?.text).toContain("1900 kkal");
    expect(userMessage?.text).toContain(
      "melebihi target *1500 kkal* sebesar *400 kkal*",
    );
  });
});
