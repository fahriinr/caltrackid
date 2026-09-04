import { Context } from "grammy";
import { sessionRepository } from "../../repositories/session.repository.js";

export async function handleHelpCommand(ctx: Context) {
  const helpText =
    `🥗 *PANDUAN PENGGUNAAN NUTRIBOT* 🥗\n\n` +
    `NutriBot adalah asisten pintar untuk mencatat & memantau asupan kalori harianmu secara otomatis menggunakan AI.\n\n` +
    `📌 *Daftar Perintah (Commands):*\n` +
    `• /start - Memulai bot / pendaftaran profil fisik\n` +
    `• /today - Melihat ringkasan asupan kalori & menu hari ini\n` +
    `• /profile - Melihat profil fisik, BMI, BMR, dan target kalori\n` +
    `• /settarget - Mengubah batas target kalori harianmu\n` +
    `• /help - Menampilkan panduan dan daftar perintah\n` +
    `• /cancel - Membatalkan proses yang sedang berjalan\n\n` +
    `📸 *Cara Logging Makanan:*\n` +
    `1. Cukup kirimkan *foto makanan atau minumanmu* ke chat ini.\n` +
    `2. Masukkan catatan porsi jika ada (atau klik tombol *Lewati*).\n` +
    `3. AI akan menganalisis nama hidangan, estimasi porsi, kalori, dan makronutrisi secara instan!\n\n` +
    `⏰ *Rekap Otomatis:* Bot akan mengirimkan laporan rekap harian setiap pukul *21:00 WIB*.`;

  await ctx.reply(helpText, { parse_mode: "Markdown" });
}

export async function handleCancelCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  await sessionRepository.clearSession(userId);
  await ctx.reply("👌 Proses telah dibatalkan. Kamu bisa mengirim foto makanan atau mengetik /today kapan saja.", {
    parse_mode: "Markdown",
  });
}
