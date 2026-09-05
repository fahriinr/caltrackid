import { getEnv } from "../src/config/env.js";
import { runMigrations } from "../src/db/migrate.js";
import { userRepository } from "../src/repositories/user.repository.js";
import { foodLogRepository } from "../src/repositories/food-log.repository.js";
import { geminiUsageRepository } from "../src/repositories/gemini-usage.repository.js";
import crypto from "crypto";

/**
 * Generate a simple signed session token for admin authentication
 */
function createAuthToken(username: string, secret: string): string {
  const payload = JSON.stringify({
    u: username,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  });
  const b64Payload = Buffer.from(payload).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(b64Payload)
    .digest("base64url");
  return `${b64Payload}.${signature}`;
}

/**
 * Verify a signed session token
 */
function verifyAuthToken(
  token: string,
  secret: string,
): { valid: boolean; username?: string } {
  try {
    if (!token || !token.includes(".")) return { valid: false };
    const [b64Payload, signature] = token.split(".");
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(b64Payload)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return { valid: false };
    }

    const payloadStr = Buffer.from(b64Payload, "base64url").toString("utf8");
    const parsed = JSON.parse(payloadStr);

    if (!parsed.exp || parsed.exp < Date.now()) {
      return { valid: false };
    }

    return { valid: true, username: parsed.u };
  } catch {
    return { valid: false };
  }
}

export default async function handler(req: any, res: any) {
  const env = getEnv();
  const secretKey =
    env.DASHBOARD_SECRET ||
    process.env.DASHBOARD_SECRET ||
    env.CRON_SECRET ||
    "caltrack-dashboard-secret-fallback-key";

  const configuredUsername =
    env.DASHBOARD_USERNAME || process.env.DASHBOARD_USERNAME || "admin";
  const configuredPassword =
    env.DASHBOARD_PASSWORD || process.env.DASHBOARD_PASSWORD || "admin123";

  const action = req.query?.action || req.body?.action || "";

  // 1. Handle Login
  if (req.method === "POST" && action === "login") {
    const { username, password } = req.body || {};

    if (
      username &&
      password &&
      username.trim().toLowerCase() ===
        configuredUsername.trim().toLowerCase() &&
      password.trim() === configuredPassword.trim()
    ) {
      const token = createAuthToken(username, secretKey);
      return res.status(200).json({
        success: true,
        token,
        username,
        expiresIn: 86400,
      });
    }

    return res.status(401).json({
      success: false,
      error: "Username atau password salah.",
    });
  }

  // 2. For all other actions, verify Bearer token or authorization header
  const authHeader =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    req.headers?.["authorization"] ||
    req.headers?.["Authorization"] ||
    "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7).trim()
    : authHeader.startsWith("bearer ")
      ? authHeader.substring(7).trim()
      : req.query?.token || "";

  const authCheck = verifyAuthToken(token, secretKey);
  if (!authCheck.valid) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized. Silakan login terlebih dahulu.",
    });
  }

  try {
    await runMigrations();

    // 3. Stats & Gemini Usage Chart Data
    if (action === "stats") {
      const daysParam = parseInt(String(req.query?.days || 14), 10);
      const days = isNaN(daysParam) ? 14 : Math.min(60, Math.max(7, daysParam));

      const [chartData, geminiTotals, userTotals, foodTotals] =
        await Promise.all([
          geminiUsageRepository.getDailyUsageStats(days),
          geminiUsageRepository.getTotalStats(),
          userRepository.countTotalUsers(),
          foodLogRepository.countTotalStats(),
        ]);

      return res.status(200).json({
        success: true,
        data: {
          chart: chartData,
          kpi: {
            totalUsers: userTotals.total,
            activeUsers: userTotals.active,
            totalFoodLogs: foodTotals.totalLogs,
            todayFoodLogs: foodTotals.todayLogs,
            totalPhotoScans: geminiTotals.totalPhotoScans,
            todayPhotoScans: geminiTotals.todayPhotoScans,
            totalTextScans: geminiTotals.totalTextScans,
            totalGeminiCalls: geminiTotals.totalCalls,
          },
        },
      });
    }

    // 4. Paginated Users Table
    if (action === "users") {
      const page = parseInt(String(req.query?.page || 1), 10);
      const limit = parseInt(String(req.query?.limit || 10), 10);
      const search = req.query?.search ? String(req.query.search) : undefined;

      const result = await userRepository.getPaginatedUsers({
        page,
        limit,
        search,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    }

    // 5. Paginated Food Logs Table
    if (action === "food-logs") {
      const page = parseInt(String(req.query?.page || 1), 10);
      const limit = parseInt(String(req.query?.limit || 10), 10);
      const search = req.query?.search ? String(req.query.search) : undefined;
      const isDeletedParam = req.query?.isDeleted;

      let isDeleted: boolean | undefined = undefined;
      if (isDeletedParam === "true") isDeleted = true;
      if (isDeletedParam === "false") isDeleted = false;

      const result = await foodLogRepository.getPaginatedLogs({
        page,
        limit,
        search,
        isDeleted,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    }

    return res.status(400).json({
      success: false,
      error: `Unknown action: ${action}`,
    });
  } catch (err: any) {
    console.error("Dashboard API error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Internal server error",
    });
  }
}
