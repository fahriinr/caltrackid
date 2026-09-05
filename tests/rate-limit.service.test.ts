import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDatabase, closeDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrate.js";
import { GeminiUsageRepository } from "../src/repositories/gemini-usage.repository.js";
import { checkPhotoScanRateLimit, LIMITS } from "../src/services/rate-limit.service.js";
import { sql } from "drizzle-orm";

describe("Photo Rate Limiting & Quota Management", () => {
  let usageRepo: GeminiUsageRepository;

  beforeAll(async () => {
    await runMigrations();
    usageRepo = new GeminiUsageRepository();

    const db = getDatabase();
    await db.execute(sql`DELETE FROM gemini_usage_logs WHERE user_id IN (88801, 88802, 1316054419);`);
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.execute(sql`DELETE FROM gemini_usage_logs WHERE user_id IN (88801, 88802, 1316054419);`);
    closeDatabase();
  });

  it("should allow regular user within 8 photo scans per day", async () => {
    const userId = 88801;
    const initialCheck = await checkPhotoScanRateLimit(userId);
    expect(initialCheck.allowed).toBe(true);

    // Simulate 7 successful scans
    for (let i = 0; i < 7; i++) {
      await usageRepo.createLog({
        userId,
        type: "PHOTO",
        status: "SUCCESS",
        durationMs: 500,
      });
    }

    const checkUnderLimit = await checkPhotoScanRateLimit(userId);
    expect(checkUnderLimit.allowed).toBe(true);

    // 8th scan
    await usageRepo.createLog({
      userId,
      type: "PHOTO",
      status: "SUCCESS",
      durationMs: 500,
    });

    // 9th attempt should be blocked
    const checkBlocked = await checkPhotoScanRateLimit(userId);
    expect(checkBlocked.allowed).toBe(false);
    expect(checkBlocked.reason).toBe("USER_DAILY_LIMIT");
    expect(checkBlocked.message).toContain("Batas Kuota Scan Foto Tercapai");
  });

  it("should bypass limits for admin user ID (1316054419)", async () => {
    const adminId = 1316054419;

    // Simulate 10 successful scans (exceeding regular limit of 8)
    for (let i = 0; i < 10; i++) {
      await usageRepo.createLog({
        userId: adminId,
        type: "PHOTO",
        status: "SUCCESS",
        durationMs: 500,
      });
    }

    const checkAdmin = await checkPhotoScanRateLimit(adminId);
    expect(checkAdmin.allowed).toBe(true);
  });
});
