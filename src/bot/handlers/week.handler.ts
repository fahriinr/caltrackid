import { Context, InlineKeyboard } from "grammy";
import { userRepository } from "../../repositories/user.repository.js";
import { foodLogRepository } from "../../repositories/food-log.repository.js";
import { getPastSevenDays } from "../../utils/date.js";

export async function handleWeekCommand(ctx: Context) {
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
  const { startDate, endDate, days, displayRange } = getPastSevenDays(timezone);

  // Fetch all non-deleted logs in the past 7 days
  const allLogs = await foodLogRepository.getLogsByDateRange(
    userId,
    startDate,
    endDate,
  );

  const target = user.dailyCalorieTarget;
  let totalWeekCalories = 0;
  let daysRecordedCount = 0;
  let onTargetDaysCount = 0;
  let overTargetDaysCount = 0;

  const dayLines: string[] = [];

  for (const day of days) {
    // Filter logs for this specific day
    const dayLogs = allLogs.filter(
      (log) => log.loggedAt >= day.dayStart && log.loggedAt <= day.dayEnd,
    );

    const dayCalories = dayLogs.reduce((acc, log) => acc + log.calories, 0);
    totalWeekCalories += dayCalories;

    const todayTag = day.isToday ? " _(Hari ini)_" : "";

    if (dayLogs.length === 0) {
      dayLines.push(
        `• *${day.dayName}*, ${day.dateFormatted}${todayTag}\n` +
          `  └ ⚪ _Tidak ada data tercatat_`,
      );
    } else {
      daysRecordedCount++;
      const diff = target - dayCalories;

      if (diff >= 0) {
        onTargetDaysCount++;
        dayLines.push(
          `• *${day.dayName}*, ${day.dateFormatted}${todayTag}\n` +
            `  └ 🟢 *${dayCalories}* / ${target} kkal · *Aman* (Sisa ${diff} kkal)`,
        );
      } else {
        overTargetDaysCount++;
        dayLines.push(
          `• *${day.dayName}*, ${day.dateFormatted}${todayTag}\n` +
            `  └ 🔴 *${dayCalories}* / ${target} kkal · *Melebihi target (+${Math.abs(diff)} kkal)*`,
        );
      }
    }
  }

  const averageCalories =
    daysRecordedCount > 0
      ? Math.round(totalWeekCalories / daysRecordedCount)
      : 0;

  const keyboard = new InlineKeyboard()
    .text("📊 Cek Hari Ini (/today)", "action_today")
    .row()
    .text("👤 Profil & Target", "action_profile");

  const responseText =
    `*REKAP ASUPAN 7 HARI TERAKHIR*\n` +
    `_${displayRange}_\n\n` +
    `🎯 *Target Harian:* ${target} kkal\n\n` +
    `*Rincian Per Hari:*\n` +
    `${dayLines.join("\n\n")}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `*Ringkasan Mingguan:*\n` +
    `• Rata-rata: *${averageCalories} kkal / hari* (${daysRecordedCount} hari aktif)\n` +
    `• Total Mingguan: *${totalWeekCalories} kkal*\n` +
    `• Status Target: *${onTargetDaysCount} hari aman*, *${overTargetDaysCount} hari over target*`;

  await ctx.reply(responseText, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}
