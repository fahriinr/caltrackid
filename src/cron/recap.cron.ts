import cron from "node-cron";
import { Bot } from "grammy";
import { userRepository } from "../repositories/user.repository.js";
import { foodLogRepository } from "../repositories/food-log.repository.js";
import { getTodayBounds, formatTimeInTimezone } from "../utils/date.js";

/**
 * Sends the 21:00 WIB daily recap to all active users.
 */
export async function runDailyRecap(bot: Bot): Promise<void> {
  console.log("⏰ Running daily 21:00 WIB recap job...");

  const activeUsers = await userRepository.listActiveUsers();
  console.log(`Found ${activeUsers.length} active users for daily recap.`);

  for (const user of activeUsers) {
    try {
      const timezone = user.timezone || "Asia/Jakarta";
      const todayBounds = getTodayBounds(timezone);
      const summary = await foodLogRepository.getDailySummary(
        user.id,
        todayBounds.startDate,
        todayBounds.endDate,
      );

      const target = user.dailyCalorieTarget;
      const currentTotal = summary.totalCalories;
      const diff = target - currentTotal;

      let message = "";

      if (summary.logs.length === 0) {
        message =
          `🌙 *REKAP MALAM NUTRIBOT* 🥗\n` +
          `📅 *${todayBounds.displayDate}*\n\n` +
          `Kamu belum mencatat asupan makanan apa pun hari ini.\n` +
          `🎯 Target harianmu: *${target} kkal*.\n\n` +
          `_Jangan lupa foto dan catat makananmu besok agar perjalanan kesehatanmu tetap terpantau!_ ✨`;
      } else {
        let statusEvaluation = "";
        if (diff >= 0) {
          statusEvaluation =
            `🎉 *Bagus Sekali!*\n` +
            `Total asupanmu hari ini *${currentTotal} kkal* dari target *${target} kkal*.\n` +
            `Kamu berada dalam batas aman dengan sisa *${diff} kkal*.`;
        } else {
          statusEvaluation =
            `⚠️ *Perhatian: Asupan Melebihi Target*\n` +
            `Total asupanmu hari ini *${currentTotal} kkal*, melebihi target *${target} kkal* sebesar *${Math.abs(diff)} kkal*.`;
        }

        const mealList = summary.logs
          .map((log, idx) => {
            const time = formatTimeInTimezone(log.loggedAt, timezone);
            return `${idx + 1}. [${time}] ${log.foodName} (${log.calories} kkal)`;
          })
          .join("\n");

        message =
          `🌙 *REKAP MALAM NUTRIBOT* (21:00 WIB) 🥗\n` +
          `📅 *${todayBounds.displayDate}*\n\n` +
          `${statusEvaluation}\n\n` +
          `🥩 *Total Nutrisi:*\n` +
          `• Protein: *${summary.totalProtein}g* | Karbo: *${summary.totalCarbs}g* | Lemak: *${summary.totalFat}g*\n\n` +
          `📋 *Menu Hari Ini:*\n` +
          `${mealList}\n\n` +
          `Tetap semangat dan istirahat yang cukup untuk besok! 💤`;
      }

      await bot.api.sendMessage(user.id, message, { parse_mode: "Markdown" });
      console.log(
        `✅ Sent daily recap to user ${user.id} (${user.username || "unknown"})`,
      );
    } catch (err) {
      console.error(`❌ Failed to send daily recap to user ${user.id}:`, err);
    }
  }
}

/**
 * Initializes the cron scheduler for 21:00 WIB (Asia/Jakarta).
 */
export function initRecapCron(bot: Bot): cron.ScheduledTask {
  // 21:00 WIB (0 21 * * *) in Asia/Jakarta timezone
  const task = cron.schedule(
    "0 21 * * *",
    async () => {
      await runDailyRecap(bot);
    },
    {
      timezone: "Asia/Jakarta",
    },
  );

  console.log("⏰ Daily recap cron job scheduled for 21:00 Asia/Jakarta.");
  return task;
}
