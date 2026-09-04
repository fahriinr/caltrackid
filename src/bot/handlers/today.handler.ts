import { Context, InlineKeyboard } from "grammy";
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
  let keyboard: InlineKeyboard | undefined;

  if (summary.logs.length === 0) {
    mealListText = `_Belum ada makanan yang dicatat hari ini._\n_Kirim foto makanan atau ketik langsung untuk mencatat._`;
  } else {
    mealListText = summary.logs
      .map((log, index) => {
        const time = formatTimeInTimezone(log.loggedAt, timezone);
        const portion = log.portionDescription
          ? ` (${log.portionDescription})`
          : "";
        return `${index + 1}. *[${time}]* ${log.foodName}${portion}\n   └ *${log.calories} kkal* (P: ${log.protein}g · K: ${log.carbs}g · L: ${log.fat}g)`;
      })
      .join("\n\n");

    keyboard = new InlineKeyboard().text(
      "Hapus / Kelola Log Hari Ini",
      "action_manage_logs",
    );
  }

  const response =
    `*REKAP ASUPAN HARI INI*\n` +
    `_${todayBounds.displayDate}_\n\n` +
    `*Target:* ${target} kkal\n` +
    `*Total Masuk:* *${currentTotal} kkal*\n` +
    `${statusText}\n\n` +
    `*Total Makronutrisi*\n` +
    `• Protein: *${summary.totalProtein}g*\n` +
    `• Karbohidrat: *${summary.totalCarbs}g*\n` +
    `• Lemak: *${summary.totalFat}g*\n\n` +
    `*Daftar Menu:*\n` +
    `${mealListText}`;

  await ctx.reply(response, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

export async function handleManageLogsCallback(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.answerCallbackQuery();

  const user = await userRepository.findById(userId);
  if (!user) return;

  const timezone = user.timezone || "Asia/Jakarta";
  const todayBounds = getTodayBounds(timezone);
  const summary = await foodLogRepository.getDailySummary(
    userId,
    todayBounds.startDate,
    todayBounds.endDate,
  );

  if (summary.logs.length === 0) {
    await ctx.reply("Tidak ada makanan aktif hari ini untuk dihapus.");
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const log of summary.logs) {
    const time = formatTimeInTimezone(log.loggedAt, timezone);
    keyboard
      .text(
        `❌ Hapus [${time}] ${log.foodName.substring(0, 15)} (${log.calories}k)`,
        `delete_log_${log.id}`,
      )
      .row();
  }
  keyboard.text("🔙 Kembali", "action_today");

  await ctx.reply(
    `🗑️ *PILIH MAKANAN YANG INGIN DIHAPUS:*\n\n` +
      `Klik tombol di bawah pada makanan yang salah dicatat. Kalori hari ini akan otomatis dihitung ulang.`,
    { parse_mode: "Markdown", reply_markup: keyboard },
  );
}
