import { getEnv } from "./config/env.js";
import { runMigrations } from "./db/migrate.js";
import { closeDatabase } from "./db/index.js";
import { createBot, setupBotCommands } from "./bot/bot.js";
import { initRecapCron } from "./cron/recap.cron.js";

async function main() {
  console.log("🚀 Starting NutriBot (Telegram AI Calorie Tracker)...");

  // 1. Validate environment
  const env = getEnv();
  console.log(`🌍 Environment: ${env.NODE_ENV} | Timezone: ${env.DEFAULT_TIMEZONE}`);

  // 2. Initialize Database Schema
  await runMigrations();

  // 3. Create Bot instance
  const bot = createBot(env.TELEGRAM_BOT_TOKEN);

  // 4. Setup Bot commands menu in Telegram
  await setupBotCommands(bot);

  // 5. Initialize Cron Jobs
  const cronTask = initRecapCron(bot);

  // 6. Handle graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    cronTask.stop();
    bot.stop();
    closeDatabase();
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  // 7. Start polling
  console.log("🤖 Bot is now polling for Telegram updates...");
  await bot.start({
    onStart(botInfo) {
      console.log(`✅ NutriBot @${botInfo.username} is running successfully!`);
    },
  });
}

main().catch((err) => {
  console.error("❌ Fatal error during NutriBot startup:", err);
  process.exit(1);
});
