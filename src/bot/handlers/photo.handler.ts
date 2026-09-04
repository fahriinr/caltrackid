import { Context, InlineKeyboard } from "grammy";
import { userRepository } from "../../repositories/user.repository.js";
import {
  sessionRepository,
  PendingFoodAnalysis,
} from "../../repositories/session.repository.js";
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

    const pendingFood: PendingFoodAnalysis = {
      food_name: result.food_name,
      portion_description: result.portion_description,
      calories: result.calories,
      macros: {
        protein_g: result.macros.protein_g,
        carbs_g: result.macros.carbs_g,
        fat_g: result.macros.fat_g,
      },
      confidence_note: result.confidence_note,
      userNote,
    };

    // Save pending food to session state for user confirmation
    await sessionRepository.setSession(userId, {
      step: "AWAITING_FOOD_CONFIRMATION",
      pendingPhotoId: photoId,
      tempData: {
        pendingFood,
      },
    });

    const noteDisplay = userNote ? `\n📝 *Catatanmu:* _${userNote}_` : "";

    const confirmationKeyboard = new InlineKeyboard()
      .text("✅ Sesuai & Simpan", "confirm_food_save")
      .row()
      .text("✏️ Koreksi / Ketik Manual", "correct_food_manual")
      .text("❌ Batalkan", "cancel_food_entry");

    const responseText =
      `🔍 *HASIL DETEKSI MAKANAN* 🥗\n\n` +
      `🍽️ *Nama Menu:* *${result.food_name}*\n` +
      `📏 *Porsi:* ${result.portion_description}${noteDisplay}\n` +
      `🔥 *Kalori:* *${result.calories} kkal*\n` +
      `🥩 *Protein:* ${result.macros.protein_g}g | 🍚 *Karbo:* ${result.macros.carbs_g}g | 🥑 *Lemak:* ${result.macros.fat_g}g\n` +
      `💡 *Catatan AI:* _${result.confidence_note}_\n\n` +
      `❓ *Apakah informasi makanan di atas sudah sesuai?*\n` +
      `Tekan *Sesuai & Simpan* untuk mencatat, atau *Koreksi* jika ingin mengetik manual.`;

    try {
      await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    } catch {}

    await ctx.reply(responseText, {
      parse_mode: "Markdown",
      reply_markup: confirmationKeyboard,
    });
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

export async function handleConfirmFoodSaveCallback(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.answerCallbackQuery();

  const user = await userRepository.findById(userId);
  if (!user) {
    await ctx.reply("⚠️ Data pengguna tidak ditemukan. Silakan ketik /start.");
    return;
  }

  const session = await sessionRepository.getSession(userId);
  const pendingFood = session.tempData?.pendingFood;

  if (!pendingFood) {
    await ctx.reply(
      "⚠️ Tidak ada data makanan yang menunggu konfirmasi. Silakan kirim foto makanan kembali.",
    );
    await sessionRepository.clearSession(userId);
    return;
  }

  // Save food log to database
  const savedLog = await foodLogRepository.create({
    userId,
    foodName: pendingFood.food_name,
    portionDescription: pendingFood.portion_description,
    calories: pendingFood.calories,
    protein: pendingFood.macros.protein_g,
    carbs: pendingFood.macros.carbs_g,
    fat: pendingFood.macros.fat_g,
    confidenceNote: pendingFood.confidence_note,
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

  const responseKeyboard = new InlineKeyboard()
    .text("📊 Cek Hari Ini (/today)", "action_today")
    .row()
    .text("🗑️ Hapus Log Ini (Jika Salah)", `delete_log_${savedLog.id}`);

  const responseText =
    `🎉 *Makanan Berhasil Dicatat!* 🥗\n\n` +
    `🍽️ *Menu:* ${pendingFood.food_name}\n` +
    `🔥 *Kalori:* +*${pendingFood.calories} kkal*\n` +
    `🥩 *Makro:* P: ${pendingFood.macros.protein_g}g | C: ${pendingFood.macros.carbs_g}g | F: ${pendingFood.macros.fat_g}g\n\n` +
    `➖➖➖➖➖➖➖➖➖➖\n` +
    `📊 *Progres Hari Ini (${todayBounds.displayDate}):*\n` +
    `🎯 *Total Asupan:* *${currentTotal}* / ${target} kkal\n` +
    `${progressStatus}\n\n` +
    `_Salah simpan? Tekan tombol di bawah untuk membatalkan/menghapus log ini._`;

  await ctx.reply(responseText, {
    parse_mode: "Markdown",
    reply_markup: responseKeyboard,
  });
}

export async function handleDeleteLogCallback(ctx: Context, logId: string) {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.answerCallbackQuery();

  const user = await userRepository.findById(userId);
  if (!user) return;

  const deleted = await foodLogRepository.softDelete(logId, userId);
  if (!deleted) {
    await ctx.reply(
      "⚠️ Log makanan tidak ditemukan atau sudah dihapus sebelumnya.",
    );
    return;
  }

  // Recalculate summary
  const todayBounds = getTodayBounds(user.timezone || "Asia/Jakarta");
  const summary = await foodLogRepository.getDailySummary(
    userId,
    todayBounds.startDate,
    todayBounds.endDate,
  );

  const target = user.dailyCalorieTarget;
  const currentTotal = summary.totalCalories;
  const diff = target - currentTotal;

  await ctx.reply(
    `🗑️ *Log Makanan Telah Dihapus!*\n\n` +
      `Menu *${deleted.foodName}* (${deleted.calories} kkal) telah dikeluarkan dari perhitungan hari ini.\n\n` +
      `📊 *Total Asupan Sekarang:* *${currentTotal} / ${target} kkal* (Sisa: ${diff >= 0 ? diff : 0} kkal)`,
    { parse_mode: "Markdown" },
  );
}

export async function handleCorrectFoodManualCallback(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.answerCallbackQuery();

  const session = await sessionRepository.getSession(userId);

  await sessionRepository.setSession(userId, {
    step: "AWAITING_FOOD_CORRECTION",
    pendingPhotoId: session.pendingPhotoId,
    tempData: session.tempData,
  });

  await ctx.reply(
    `✏️ *Koreksi Makanan Manual*\n\n` +
      `Silakan ketik nama makanan atau rincian porsi yang sebenarnya:\n` +
      `_(Contoh: "Ayam geprek dada tanpa nasi, es teh tawar" atau "Sate kambing 5 tusuk")_\n\n` +
      `AI akan memperbarui estimasi nutrisinya untukmu.`,
    { parse_mode: "Markdown" },
  );
}

export async function handleCancelFoodEntryCallback(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.answerCallbackQuery();
  await sessionRepository.clearSession(userId);

  await ctx.reply(
    "❌ Pencatatan makanan telah dibatalkan. Kamu dapat mengirim foto makanan lain kapan saja.",
    {
      parse_mode: "Markdown",
    },
  );
}

export async function handleFoodCorrectionText(
  ctx: Context,
  correctionText: string,
) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = await sessionRepository.getSession(userId);
  const photoId = session.pendingPhotoId;

  if (photoId) {
    // Re-analyze with the photo and user's correction
    await processFoodAnalysis(ctx, userId, photoId, correctionText);
  } else {
    // If no photo in session, analyze based on text directly
    await processTextFoodAnalysis(ctx, userId, correctionText);
  }
}

export async function processTextFoodAnalysis(
  ctx: Context,
  userId: number,
  foodDescription: string,
) {
  const user = await userRepository.findById(userId);
  if (!user || user.status !== "ACTIVE") {
    await ctx.reply(
      "⚠️ Kamu belum mendaftar. Silakan ketik /start untuk memulai!",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const processingMsg = await ctx.reply(
    `⏳ *Sedang menganalisis nutrisi "${foodDescription}" dengan AI...*\nMohon tunggu beberapa detik...`,
    { parse_mode: "Markdown" },
  );

  try {
    const result = await geminiService.analyzeFoodText(foodDescription);

    const pendingFood: PendingFoodAnalysis = {
      food_name: result.food_name || foodDescription,
      portion_description: result.portion_description,
      calories: result.calories,
      macros: {
        protein_g: result.macros.protein_g,
        carbs_g: result.macros.carbs_g,
        fat_g: result.macros.fat_g,
      },
      confidence_note: result.confidence_note,
      userNote: foodDescription,
    };

    await sessionRepository.setSession(userId, {
      step: "AWAITING_FOOD_CONFIRMATION",
      pendingPhotoId: null,
      tempData: {
        pendingFood,
      },
    });

    const confirmationKeyboard = new InlineKeyboard()
      .text("✅ Sesuai & Simpan", "confirm_food_save")
      .row()
      .text("✏️ Koreksi / Ketik Manual", "correct_food_manual")
      .text("❌ Batalkan", "cancel_food_entry");

    const responseText =
      `🔍 *HASIL ESTIMASI MAKANAN (INPUT TEKS)* 🥗\n\n` +
      `🍽️ *Nama Menu:* *${result.food_name || foodDescription}*\n` +
      `📏 *Porsi:* ${result.portion_description}\n` +
      `🔥 *Estimasi Kalori:* *${result.calories} kkal*\n` +
      `🥩 *Protein:* ${result.macros.protein_g}g | 🍚 *Karbo:* ${result.macros.carbs_g}g | 🥑 *Lemak:* ${result.macros.fat_g}g\n` +
      `💡 *Catatan AI:* _${result.confidence_note}_\n\n` +
      `❓ *Apakah informasi makanan di atas sudah sesuai?*\n` +
      `Tekan *Sesuai & Simpan* untuk mencatat ke kalori hari ini.`;

    try {
      await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    } catch {}

    await ctx.reply(responseText, {
      parse_mode: "Markdown",
      reply_markup: confirmationKeyboard,
    });
  } catch (error: any) {
    console.error("Text food analysis error:", error);

    try {
      await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    } catch {}

    await sessionRepository.clearSession(userId);

    await ctx.reply(
      `❌ *Gagal mengestimasi nutrisi makanan tersebut.*\nSilakan coba kirim foto atau ketik deskripsi makanan yang lebih spesifik.`,
      { parse_mode: "Markdown" },
    );
  }
}
