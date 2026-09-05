import { createBot } from "../src/bot/bot.js";
import { runDailyRecap, sendUserDailyRecap } from "../src/cron/recap.cron.js";
import { runMigrations } from "../src/db/migrate.js";
import { getEnv } from "../src/config/env.js";

// Lazy bot instantiation to prevent top-level unhandled initialization errors
let botInstance: ReturnType<typeof createBot> | null = null;
function getBot() {
  if (!botInstance) {
    botInstance = createBot();
  }
  return botInstance;
}

export default async function handler(req: any, res: any) {
  // Allow GET or POST for external cron services like cron-job.org or manual browser/curl testing
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Security Check: Verify CRON_SECRET if configured in Environment Variables
  const env = getEnv();
  const cronSecret = env.CRON_SECRET || process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader =
      req.headers?.authorization || req.headers?.Authorization || "";
    const xCronSecret =
      req.headers?.["x-cron-secret"] || req.headers?.["x-api-key"] || "";
    const querySecret = req.query?.secret || "";

    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : authHeader.trim();

    const isAuthorized =
      bearerToken === cronSecret ||
      xCronSecret === cronSecret ||
      querySecret === cronSecret;

    if (!isAuthorized) {
      console.warn("⚠️ Unauthorized attempt to trigger recap cron endpoint.");
      return res.status(401).json({
        success: false,
        error:
          "Unauthorized: Invalid or missing secret token in Authorization header or secret parameter.",
      });
    }
  }

  // Check if a specific userId is passed via query params or JSON body (e.g. ?userId=1316054419)
  const queryUserId = req.query?.userId || req.query?.test || req.body?.userId;
  const targetUserId = queryUserId
    ? parseInt(String(queryUserId), 10)
    : undefined;

  console.log(
    `🔔 Triggering Daily Recap Endpoint... ${targetUserId ? `(Target User ID: ${targetUserId})` : "(All Active Users)"}`,
  );

  try {
    const bot = getBot();
    await runMigrations();

    if (targetUserId) {
      const success = await sendUserDailyRecap(bot, targetUserId);
      if (!success) {
        return res.status(404).json({
          success: false,
          message: `User ${targetUserId} not found or failed to send message.`,
        });
      }
      return res.status(200).json({
        success: true,
        message: `Daily recap sent successfully to user ${targetUserId}.`,
      });
    }

    await runDailyRecap(bot);
    return res.status(200).json({
      success: true,
      message: "Daily recap sent successfully to all active users.",
    });
  } catch (err: any) {
    console.error("Error running daily recap cron on Vercel:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Unknown error",
    });
  }
}
