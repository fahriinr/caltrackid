import { Context, InlineKeyboard } from "grammy";
import { userRepository } from "../../repositories/user.repository.js";
import { sessionRepository } from "../../repositories/session.repository.js";
import { foodLogRepository } from "../../repositories/food-log.repository.js";
import { geminiService } from "../../services/gemini.service.js";
import { downloadTelegramPhoto } from "../../utils/telegram.js";
import { getEnv } from "../../config/env.js";
import { getTodayBounds } from "../../utils/date.js";

export async function handlePhotoReceived(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = await userRepository.findById(userId);
  if (!user || user.status !== "ACTIVE") {
    await ctx.reply(
      "⚠️ Kamu belum menyelesaikan pendaftaran profil.\n\nSilakan ketik /start terlebih dahulu untuk mendaftar!",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) {
    await ctx.reply(
      "⚠️ Tidak ada foto yang terdeteksi. Silakan kirimkan foto makanan.",
    );
    return;
  }

  // Get highest resolution photo (last element in array)
  const highestPhoto = photos[photos.length - 1];
  const fileId = highestPhoto.file_id;

  // If user included a caption with the photo directly, we can process immediately!
  const caption = ctx.message?.caption?.trim();

  if (caption && caption.length > 0) {
    await processFoodAnalysis(ctx, userId, fileId, caption);
    return;
  }

  // Otherwise, save pending photo and ask for optional note
  await sessionRepository.setSession(userId, {
    step: "AWAITING_FOOD_NOTE",
    pendingPhotoId: fileId,
  });

  const keyboard = new InlineKeyboard().text(
    "⏭️ Lewati / Skip",
    "skip_food_note",
  );

  await ctx.reply(
    `📸 *Foto diterima!*\n\n` +
      `Ada catatan tambahan untuk makanan ini?\n` +
      `_(Contoh: "Ayam bakar dada, nasi 1/2 porsi, es teh tawar tanpa gula")_\n\n` +
      `👉 *Ketik catatanmu* atau tekan tombol *Lewati* jika tidak ada.`,
    { parse_mode: "Markdown", reply_markup: keyboard },
  );
}

export async function handleSkipFoodNoteCallback(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.answerCallbackQuery();

  const session = await sessionRepository.getSession(userId);
  const photoId = session.pendingPhotoId;

  if (!photoId) {
    await ctx.reply(
      "⚠️ Tidak ada foto aktif yang menunggu analisis. Silakan kirim foto makanan kembali.",
    );
    await sessionRepository.clearSession(userId);
    return;
  }

  await processFoodAnalysis(ctx, userId, photoId, undefined);
}

export async function handleFoodNoteText(ctx: Context, noteText: string) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = await sessionRepository.getSession(userId);
  const photoId = session.pendingPhotoId;

  if (!photoId) {
    await ctx.reply(
      "⚠️ Tidak ada foto aktif yang menunggu catatan. Silakan kirim foto makanan terlebih dahulu.",
    );
    await sessionRepository.clearSession(userId);
    return;
  }

  await processFoodAnalysis(ctx, userId, photoId, noteText);
}

export async function processFoodAnalysis(
  ctx: Context,
  userId: number,
  photoId: string,
  userNote?: string,
) {
  const user = await userRepository.findById(userId);
  if (!user) {
    await ctx.reply("⚠️ Data pengguna tidak ditemukan. Silakan ketik /start.");
    return;
  }

  const processingMsg = await ctx.reply(
    `⏳ *Sedang menganalisis nutrisi makananmu dengan AI...*\nMohon tunggu beberapa detik...`,
    { parse_mode: "Markdown" },
  );

  try {
    const env = getEnv();
    const { buffer, mimeType } = await downloadTelegramPhoto(
      ctx.api,
      photoId,
      env.TELEGRAM_BOT_TOKEN,
    );

    const result = await geminiService.analyzeFoodImage(
      buffer,
      mimeType,
      userNote,
    );

    // Save food log to database
    const savedLog = await foodLogRepository.create({
      userId,
      foodName: result.food_name,
      portionDescription: result.portion_description,
      calories: result.calories,
      protein: result.macros.protein_g,
      carbs: result.macros.carbs_g,
      fat: result.macros.fat_g,
      confidenceNote: result.confidence_note,
    });

    // Clear session state
    await sessionRepository.clearSession(userId);

    // Fetch updated daily summary
    const todayBounds = getTodayBounds(user.timezone || "Asia/Jakarta");
    const summary = await foodLogRepository.getDailySummary(
      userId,
      todayBounds.startDate,
      todayBounds.endDate,
    );

    const target = user.dailyCalorieTarget;
    const currentTotal = summary.totalCalories;
    const diff = target - currentTotal;

    let progressStatus = "";
    if (diff >= 0) {
      progressStatus = `🟢 *Aman!* Sisa kuota hari ini: *${diff} kkal*`;
    } else {
      progressStatus = `🔴 *Perhatian:* Melebihi target sebesar *${Math.abs(diff)} kkal*`;
    }

    const noteDisplay = userNote ? `\n📝 *Catatanmu:* _${userNote}_` : "";

    const responseText =
      `✅ *Makanan Berhasil Dicatat!* 🥗\n\n` +
      `🍽️ *Menu:* ${result.food_name}\n` +
      `📏 *Porsi:* ${result.portion_description}${noteDisplay}\n` +
      `🔥 *Kalori:* *${result.calories} kkal*\n` +
      `🥩 *Protein:* ${result.macros.protein_g}g | 🍚 *Karbo:* ${result.macros.carbs_g}g | 🥑 *Lemak:* ${result.macros.fat_g}g\n` +
      `💡 *Catatan AI:* _${result.confidence_note}_\n\n` +
      `➖➖➖➖➖➖➖➖➖➖\n` +
      `📊 *Progres Hari Ini (${todayBounds.displayDate}):*\n` +
      `🎯 *Total Asupan:* ${currentTotal} / ${target} kkal\n` +
      `${progressStatus}\n\n` +
      `Ketik /today untuk melihat rincian seluruh makanan hari ini.`;

    try {
      await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    } catch {
      // Ignore if deletion fails
    }

    await ctx.reply(responseText, { parse_mode: "Markdown" });
  } catch (error: any) {
    console.error("Food analysis error:", error);

    try {
      await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    } catch {}

    await sessionRepository.clearSession(userId);

    await ctx.reply(
      `❌ *Maaf, terjadi kendala saat menganalisis foto makanan.*\n\n` +
        `Kemungkinan penyebab:\n` +
        `• Foto kurang jelas atau buram.\n` +
        `• Layanan AI sedang sibuk/timeout.\n\n` +
        `👉 *Solusi:* Silakan kirimkan kembali foto makanan yang lebih jelas atau coba beberapa saat lagi.`,
      { parse_mode: "Markdown" },
    );
  }
}
