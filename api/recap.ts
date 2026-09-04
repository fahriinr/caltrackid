import { createBot } from "../src/bot/bot.js";
import { runDailyRecap } from "../src/cron/recap.cron.js";
import { runMigrations } from "../src/db/migrate.js";

const bot = createBot();

export default async function handler(req: any, res: any) {
  // Allow Vercel Cron or manual trigger
  console.log("🔔 Triggering Vercel Cron Daily Recap...");

  try {
    await runMigrations();
    await runDailyRecap(bot);
    return res.status(200).json({ success: true, message: "Daily recap sent successfully." });
  } catch (err: any) {
    console.error("Error running daily recap cron on Vercel:", err);
    return res.status(500).json({ success: false, error: err.message || "Unknown error" });
  }
}
