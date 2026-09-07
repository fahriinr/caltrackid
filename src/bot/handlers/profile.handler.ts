import { Context, InlineKeyboard } from "grammy";
import { userRepository } from "../../repositories/user.repository.js";
import { sessionRepository } from "../../repositories/session.repository.js";
import { calculateBodyMetrics } from "../../services/nutrition.service.js";

export async function handleProfileCommand(ctx: Context) {
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

  const metrics = calculateBodyMetrics(
    user.gender as "MALE" | "FEMALE",
    user.age,
    user.height,
    user.weight,
  );

  const isNotifActive = user.notificationsEnabled !== false;
  const statusText = isNotifActive
    ? "🔔 Notifikasi Harian Aktif (21:00 WIB)"
    : "🔕 Notifikasi Harian Nonaktif";

  const toggleNotifButton = isNotifActive
    ? {
        text: "🔕 Matikan Notifikasi Harian",
        data: "action_unsubscribe_notif",
      }
    : {
        text: "🔔 Aktifkan Notifikasi Harian",
        data: "action_subscribe_notif",
      };

  const keyboard = new InlineKeyboard()
    .text("🎯 Ubah Target Kalori", "action_change_target")
    .row()
    .text(toggleNotifButton.text, toggleNotifButton.data)
    .row()
    .text("🔄 Hitung Ulang Profil", "action_restart_onboarding");

  const genderText = user.gender === "MALE" ? "👨 Laki-laki" : "👩 Perempuan";

  const response =
    `*PROFIL PENGGUNA*\n\n` +
    `• *Username:* ${user.username ? "@" + user.username : "-"}\n` +
    `• *Jenis Kelamin:* ${genderText}\n` +
    `• *Umur:* ${user.age} tahun\n` +
    `• *Tinggi / Berat:* ${user.height} cm / ${user.weight} kg\n` +
    `• *BMI:* *${user.bmi}* (${metrics.bmiCategory})\n` +
    `• *BMR / TDEE:* ${metrics.bmr} kkal / ${metrics.tdee} kkal\n` +
    `• *Target Kalori:* *${user.dailyCalorieTarget} kkal/hari*\n` +
    `• *Status Notifikasi:* ${statusText}\n` +
    `• *Zona Waktu:* ${user.timezone}\n\n` +
    `Pilih menu di bawah untuk mengubah target atau pengaturan notifikasi.`;

  await ctx.reply(response, { parse_mode: "Markdown", reply_markup: keyboard });
}

export async function handleUnsubscribeCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = await userRepository.findById(userId);
  if (!user) {
    await ctx.reply("⚠️ Kamu belum mendaftar. Silakan ketik /start.");
    return;
  }

  await userRepository.updateNotificationPreference(userId, false);
  await ctx.reply(
    `🔕 *Notifikasi Rekap Harian Dinonaktifkan*\n\n` +
      `Kamu tidak akan lagi menerima pesan rekap otomatis pukul 21:00 WIB.\n\n` +
      `👉 *Catatan:*\n` +
      `• Akunmu tetap aktif! Kamu tetap bebas mencatat makanan, foto, dan melihat rekap kapan saja via \`/today\` dan \`/week\`.\n` +
      `• Untuk mengaktifkan kembali notifikasi rekap malam, ketik perintah \`/subscribe\`.`,
    { parse_mode: "Markdown" },
  );
}

export async function handleSubscribeCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = await userRepository.findById(userId);
  if (!user) {
    await ctx.reply("⚠️ Kamu belum mendaftar. Silakan ketik /start.");
    return;
  }

  await userRepository.updateNotificationPreference(userId, true);
  await ctx.reply(
    `🔔 *Notifikasi Rekap Harian Diaktifkan!*\n\n` +
      `Cal akan mengirimkan ringkasan nutrisi harianmu setiap malam pukul *21:00 WIB*.\n\n` +
      `Untuk mematikannya kembali kapan saja, ketik \`/unsubscribe\`.`,
    { parse_mode: "Markdown" },
  );
}

export async function handleSetTargetCommand(ctx: Context) {
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

  // Check if argument was passed in command, e.g. /settarget 2100
  const text = ctx.message?.text || "";
  const parts = text.split(" ").filter((p) => p.trim().length > 0);

  if (parts.length >= 2) {
    const target = parseInt(parts[1], 10);
    if (!isNaN(target) && target >= 800 && target <= 8000) {
      await userRepository.updateTarget(userId, target);
      await ctx.reply(
        `✅ Target kalori harianmu berhasil diperbarui menjadi *${target} kkal*!`,
        {
          parse_mode: "Markdown",
        },
      );
      return;
    }
  }

  await sessionRepository.setSession(userId, {
    step: "AWAITING_TARGET_UPDATE",
  });
  await ctx.reply(
    `🎯 *Ubah Target Kalori Harian*\n\n` +
      `Target saat ini: *${user.dailyCalorieTarget} kkal*\n\n` +
      `Ketik angka target kalori baru yang kamu inginkan (contoh: *1900*):`,
    { parse_mode: "Markdown" },
  );
}

export async function handleTargetUpdateInput(ctx: Context, text: string) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const target = parseInt(text.trim(), 10);
  if (isNaN(target) || target < 800 || target > 8000) {
    await ctx.reply(
      "⚠️ Masukkan angka target kalori yang valid antara 800 - 8000 kkal (contoh: *2000*).",
      {
        parse_mode: "Markdown",
      },
    );
    return;
  }

  await userRepository.updateTarget(userId, target);
  await sessionRepository.clearSession(userId);

  await ctx.reply(
    `✅ Target kalori harianmu berhasil diperbarui menjadi *${target} kkal*! 🎉`,
    {
      parse_mode: "Markdown",
    },
  );
}
