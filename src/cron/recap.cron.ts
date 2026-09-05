import cron from "node-cron";
import { Bot, GrammyError } from "grammy";
import { userRepository } from "../repositories/user.repository.js";
import { foodLogRepository } from "../repositories/food-log.repository.js";
import { getTodayBounds, formatTimeInTimezone } from "../utils/date.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends daily recap to a specific user by userId with retry mechanism for Telegram rate limits.
 */
export async function sendUserDailyRecap(
  bot: Bot,
  userId: number,
  retries: number = 2,
): Promise<boolean> {
  const user = await userRepository.findById(userId);
  if (!user) {
    console.warn(`User ${userId} not found for recap.`);
    return false;
  }

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
        `*REKAP MALAM CALTRACK*\n` +
        `_${todayBounds.displayDate}_\n\n` +
        `Belum ada asupan makanan yang tercatat hari ini.\n` +
        `Target harian: *${target} kkal*.\n\n` +
        `_Besok jangan lupa kirim foto atau chat Cal ya agar asupanmu tetap terpantau._`;
    } else {
      let statusEvaluation = "";
      if (diff >= 0) {
        statusEvaluation =
          `*Status: Sesuai Target*\n` +
          `Total asupan: *${currentTotal} kkal* / Target: *${target} kkal*\n` +
          `Sisa kuota: *${diff} kkal*`;
      } else {
        statusEvaluation =
          `*Status: Melebihi Target*\n` +
          `Total asupan: *${currentTotal} kkal* / Target: *${target} kkal*\n` +
          `Kelebihan: *${Math.abs(diff)} kkal*`;
      }

      const mealList = summary.logs
        .map((log, idx) => {
          const time = formatTimeInTimezone(log.loggedAt, timezone);
          return `${idx + 1}. [${time}] ${log.foodName} — *${log.calories} kkal*`;
        })
        .join("\n");

      message =
        `*REKAP HARIAN CALTRACK* (21:00 WIB)\n` +
        `_${todayBounds.displayDate}_\n\n` +
        `${statusEvaluation}\n\n` +
        `*Ringkasan Makronutrisi*\n` +
        `• Protein: *${summary.totalProtein}g*\n` +
        `• Karbohidrat: *${summary.totalCarbs}g*\n` +
        `• Lemak: *${summary.totalFat}g*\n\n` +
        `*Daftar Menu:*\n` +
        `${mealList}\n\n` +
        `_Selamat beristirahat dan sampai jumpa besok!_ — Cal`;
    }

    await bot.api.sendMessage(user.id, message, { parse_mode: "Markdown" });
    console.log(
      `✅ Sent daily recap to user ${user.id} (${user.username || "unknown"})`,
    );
    return true;
  } catch (err: any) {
    if (err instanceof GrammyError) {
      // 429 Too Many Requests: Wait for retry_after seconds
      if (err.error_code === 429 && retries > 0) {
        const retryAfter = (err.parameters?.retry_after || 1) * 1000;
        console.warn(
          `⏳ Telegram rate limit reached. Retrying user ${userId} in ${retryAfter}ms...`,
        );
        await sleep(retryAfter);
        return sendUserDailyRecap(bot, userId, retries - 1);
      }

      // 403 Forbidden: User blocked the bot or chat was deleted
      if (err.error_code === 403) {
        console.warn(`🚫 User ${userId} has blocked the bot. Skipping recap.`);
        return false;
      }
    }

    console.error(
      `❌ Failed to send daily recap to user ${userId}:`,
      err?.message ?? err,
    );
    return false;
  }
}

/**
 * Sends the 21:00 WIB daily recap to all active users with safe pacing (max ~25 msg/s).
 */
export async function runDailyRecap(
  bot: Bot,
  targetUserId?: number,
): Promise<void> {
  if (targetUserId) {
    console.log(`⏰ Running targeted daily recap for user ${targetUserId}...`);
    await sendUserDailyRecap(bot, targetUserId);
    return;
  }

  console.log("⏰ Running daily 21:00 WIB recap job...");
  const activeUsers = await userRepository.listActiveUsers();
  console.log(`Found ${activeUsers.length} active users for daily recap.`);

  for (let i = 0; i < activeUsers.length; i++) {
    const user = activeUsers[i];
    await sendUserDailyRecap(bot, user.id);

    // Add safe 40ms pacing delay between users to stay comfortably under Telegram's 30 msg/sec limit
    if (i < activeUsers.length - 1) {
      await sleep(40);
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
