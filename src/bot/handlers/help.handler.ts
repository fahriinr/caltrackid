import { Context } from "grammy";
import { sessionRepository } from "../../repositories/session.repository.js";

export async function handleHelpCommand(ctx: Context) {
  const helpText =
    `🥗 *PANDUAN PENGGUNAAN CALTRACK (CAL)* 🥗\n\n` +
    `CalTrack (panggil aja *Cal*) adalah asisten pintar untuk mencatat & memantau asupan kalori harianmu secara otomatis menggunakan AI.\n\n` +
    `📌 *Daftar Perintah (Commands):*\n` +
    `• /start - Memulai bot / pendaftaran profil fisik\n` +
    `• /today - Melihat ringkasan asupan kalori & menu hari ini\n` +
    `• /week - Melihat rekap kalori per hari selama 7 hari terakhir\n` +
    `• /catat <makanan> - Mencatat makanan via teks (misal lupa foto)\n` +
    `• /profile - Melihat profil fisik, BMI, BMR, dan target kalori\n` +
    `• /settarget - Mengubah batas target kalori harianmu\n` +
    `• /help - Menampilkan panduan dan daftar perintah\n` +
    `• /cancel - Membatalkan proses yang sedang berjalan\n\n` +
    `📸 *Cara Mencatat Makanan:*\n` +
    `1. *Kirim Foto:* Cukup foto makananmu dan kirim ke chat ini (bisa ditambah catatan porsi/detail).\n` +
    `2. *Ketik Teks Langsung:* Jika lupa foto saat makan siang/pagi, langsung ketik nama makananmu atau gunakan /catat (contoh: _"tadi siang makan bakso urat 1 mangkok, es jeruk"_).\n` +
    `3. *Konfirmasi Preview:* Cal akan menampilkan estimasi kalori & makro. Jika cocok tinggal tekan *Sesuai & Simpan*, jika kurang pas bisa diedit atau dikoreksi!\n` +
    `4. *Hapus / Edit Log:* Jika salah catat, kamu bisa hapus log makanan dari tombol setelah mencatat atau lewat menu /today.\n\n` +
    `⏰ *Rekap Otomatis:* Cal akan mengirimkan laporan rekap harian setiap pukul *21:00 WIB*.`;

  await ctx.reply(helpText, { parse_mode: "Markdown" });
}

export async function handleCancelCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  await sessionRepository.clearSession(userId);
  await ctx.reply(
    "👌 Proses telah dibatalkan. Kamu bisa mengirim foto makanan atau mengetik /today kapan saja.",
    {
      parse_mode: "Markdown",
    },
  );
}
