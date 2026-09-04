import { Context } from "grammy";
import { userRepository } from "../../repositories/user.repository.js";
import { foodLogRepository } from "../../repositories/food-log.repository.js";
import { getTodayBounds, formatTimeInTimezone } from "../../utils/date.js";

export async function handleTodayCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = await userRepository.findById(userId);
  if (!user || user.status !== "ACTIVE") {
    await ctx.reply(
      "⚠️ Kamu belum mendaftar. Silakan ketik /start untuk memulai!",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const timezone = user.timezone || "Asia/Jakarta";
  const todayBounds = getTodayBounds(timezone);
  const summary = await foodLogRepository.getDailySummary(
    userId,
    todayBounds.startDate,
    todayBounds.endDate,
  );

  const target = user.dailyCalorieTarget;
  const currentTotal = summary.totalCalories;
  const diff = target - currentTotal;

  let statusText = "";
  if (diff >= 0) {
    statusText = `🟢 *Status:* Aman (Sisa *${diff} kkal*)`;
  } else {
    statusText = `🔴 *Status:* Melebihi target sebesar *${Math.abs(diff)} kkal*`;
  }

  let mealListText = "";
  if (summary.logs.length === 0) {
    mealListText = `_Belum ada makanan yang dicatat hari ini._\n📸 _Kirim foto makananmu sekarang untuk mulai mencatat!_`;
  } else {
    mealListText = summary.logs
      .map((log, index) => {
        const time = formatTimeInTimezone(log.loggedAt, timezone);
        const portion = log.portionDescription
          ? ` (${log.portionDescription})`
          : "";
        return `${index + 1}. *[${time}]* ${log.foodName}${portion}\n   └ 🔥 *${log.calories} kkal* (P: ${log.protein}g | C: ${log.carbs}g | F: ${log.fat}g)`;
      })
      .join("\n\n");
  }

  const response =
    `📊 *REKAP ASUPAN HARI INI* 🥗\n` +
    `📅 *${todayBounds.displayDate}*\n\n` +
    `🎯 *Target Kalori:* ${target} kkal\n` +
    `🔥 *Total Kalori Masuk:* *${currentTotal} kkal*\n` +
    `${statusText}\n\n` +
    `🥩 *Total Makronutrisi Hari Ini:*\n` +
    `• Protein: *${summary.totalProtein} g*\n` +
    `• Karbohidrat: *${summary.totalCarbs} g*\n` +
    `• Lemak: *${summary.totalFat} g*\n\n` +
    `📋 *Daftar Menu yang Dikonsumsi:*\n` +
    `${mealListText}\n\n` +
    `💡 _Tips: Kirim foto setiap kali kamu makan untuk melacak kalori secara real-time!_`;

  await ctx.reply(response, { parse_mode: "Markdown" });
}
