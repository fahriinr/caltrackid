import { Context, InlineKeyboard } from "grammy";
import { userRepository } from "../../repositories/user.repository.js";
import {
  sessionRepository,
  OnboardingTempData,
} from "../../repositories/session.repository.js";
import { calculateBodyMetrics } from "../../services/nutrition.service.js";
import { getMainReplyKeyboard } from "../keyboards/main.keyboard.js";

export async function handleStartCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const existingUser = await userRepository.findById(userId);

  if (existingUser && existingUser.status === "ACTIVE") {
    // Send persistent reply keyboard
    await ctx.reply(
      `👋 Halo kembali, *${ctx.from.first_name || "Sobat Sehat"}*!\n\n` +
        `Cal siap bantu pantau asupan kalorimu hari ini.\n\n` +
        `🎯 *Target Kalori Harian:* ${existingUser.dailyCalorieTarget} kkal\n` +
        `⚖️ *BMI:* ${existingUser.bmi} (${existingUser.gender === "MALE" ? "Laki-laki" : "Perempuan"}, ${existingUser.weight} kg / ${existingUser.height} cm)\n\n` +
        `📸 *Cara Pakai:* Cukup kirimkan *foto makananmu* ke chat ini atau gunakan menu tombol di bawah untuk navigasi cepat.`,
      { parse_mode: "Markdown", reply_markup: getMainReplyKeyboard() },
    );
    return;
  }

  // Start onboarding flow
  await startOnboardingFlow(ctx, userId);
}

export async function startOnboardingFlow(ctx: Context, userId: number) {
  await sessionRepository.setSession(userId, {
    step: "ONBOARDING_GENDER",
    tempData: {},
  });

  const keyboard = new InlineKeyboard()
    .text("👨 Laki-laki", "gender_MALE")
    .text("👩 Perempuan", "gender_FEMALE");

  await ctx.reply(
    `👋 Halo! Kenalin, aku *CalTrack* (kamu bisa panggil aku *Cal*)! 🥗\n` +
      `Asisten pintar pemantau kalori & nutrisi harianmu berbasis AI.\n\n` +
      `Sebelum kita mulai, yuk lengkapi profil fisikmu terlebih dahulu agar Cal bisa menghitung rekomendasi target kalori yang paling pas untukmu.\n\n` +
      `👉 *Pilih jenis kelaminmu:*`,
    { parse_mode: "Markdown", reply_markup: keyboard },
  );
}

export async function handleGenderCallback(
  ctx: Context,
  gender: "MALE" | "FEMALE",
) {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.answerCallbackQuery();

  await sessionRepository.setSession(userId, {
    step: "ONBOARDING_AGE",
    tempData: { gender },
  });

  const genderText = gender === "MALE" ? "👨 Laki-laki" : "👩 Perempuan";
  await ctx.reply(
    `✅ Jenis kelamin: *${genderText}*\n\n` +
      `👉 Berapa *umurmu* saat ini? (Ketik angka tahun, contoh: *25*)`,
    { parse_mode: "Markdown" },
  );
}

export async function handleAgeInput(ctx: Context, text: string) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const age = parseInt(text.trim(), 10);
  if (isNaN(age) || age < 10 || age > 120) {
    await ctx.reply(
      "⚠️ Mohon masukkan umur yang valid antara 10 sampai 120 tahun (contoh: *25*).",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const session = await sessionRepository.getSession(userId);
  const tempData: OnboardingTempData = { ...session.tempData, age };

  await sessionRepository.setSession(userId, {
    step: "ONBOARDING_HEIGHT",
    tempData,
  });

  await ctx.reply(
    `✅ Umur: *${age} tahun*\n\n` +
      `👉 Berapa *tinggi badanmu* dalam cm? (Contoh: *170*)`,
    { parse_mode: "Markdown" },
  );
}

export async function handleHeightInput(ctx: Context, text: string) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const height = parseFloat(text.replace(",", ".").trim());
  if (isNaN(height) || height < 50 || height > 260) {
    await ctx.reply(
      "⚠️ Mohon masukkan tinggi badan yang valid antara 50 sampai 260 cm (contoh: *170*).",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const session = await sessionRepository.getSession(userId);
  const tempData: OnboardingTempData = { ...session.tempData, height };

  await sessionRepository.setSession(userId, {
    step: "ONBOARDING_WEIGHT",
    tempData,
  });

  await ctx.reply(
    `✅ Tinggi badan: *${height} cm*\n\n` +
      `👉 Berapa *berat badanmu* saat ini dalam kg? (Contoh: *65.5*)`,
    { parse_mode: "Markdown" },
  );
}

export async function handleWeightInput(ctx: Context, text: string) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const weight = parseFloat(text.replace(",", ".").trim());
  if (isNaN(weight) || weight < 20 || weight > 350) {
    await ctx.reply(
      "⚠️ Mohon masukkan berat badan yang valid antara 20 sampai 350 kg (contoh: *65*).",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const session = await sessionRepository.getSession(userId);
  const gender = session.tempData?.gender || "MALE";
  const age = session.tempData?.age || 25;
  const height = session.tempData?.height || 170;

  const metrics = calculateBodyMetrics(gender, age, height, weight);

  const tempData: OnboardingTempData = {
    ...session.tempData,
    weight,
    bmi: metrics.bmi,
    bmr: metrics.bmr,
    tdee: metrics.tdee,
    recommendedCalories: metrics.recommendedCalories,
  };

  await sessionRepository.setSession(userId, {
    step: "ONBOARDING_TARGET_CHOICE",
    tempData,
  });

  const keyboard = new InlineKeyboard()
    .text(
      `✅ Gunakan Rekomendasi (${metrics.recommendedCalories} kkal)`,
      "target_use_recommended",
    )
    .row()
    .text("✏️ Atur Target Sendiri", "target_custom");

  await ctx.reply(
    `📊 *Hasil Analisis Tubuhmu:*\n\n` +
      `• *BMI (Body Mass Index):* ${metrics.bmi} (${metrics.bmiCategory})\n` +
      `• *Keterangan:* ${metrics.bmiAdvice}\n` +
      `• *BMR (Basal Metabolic Rate):* ${metrics.bmr} kkal\n` +
      `• *TDEE (Kebutuhan Energi Harian):* ${metrics.tdee} kkal\n\n` +
      `🎯 *Rekomendasi Asupan Harian:* *${metrics.recommendedCalories} kkal/hari*\n\n` +
      `Silakan pilih target kalori yang ingin kamu gunakan:`,
    { parse_mode: "Markdown", reply_markup: keyboard },
  );
}

export async function handleTargetChoiceCallback(
  ctx: Context,
  action: "use_recommended" | "custom",
) {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.answerCallbackQuery();

  const session = await sessionRepository.getSession(userId);
  const tempData = session.tempData;

  if (
    !tempData ||
    !tempData.gender ||
    !tempData.age ||
    !tempData.height ||
    !tempData.weight
  ) {
    await ctx.reply(
      "⚠️ Data sesi kedaluwarsa. Silakan mulai ulang dengan /start.",
    );
    await sessionRepository.clearSession(userId);
    return;
  }

  if (action === "use_recommended") {
    const targetCalories = tempData.recommendedCalories || 2000;
    await completeRegistration(ctx, userId, tempData, targetCalories);
  } else {
    await sessionRepository.setSession(userId, {
      step: "AWAITING_CUSTOM_TARGET",
      tempData,
    });

    await ctx.reply(
      `✏️ *Atur Target Kalori Sendiri*\n\n` +
        `Ketik angka target kalori harian yang kamu inginkan dalam kkal (contoh: *1800* atau *2200*):`,
      { parse_mode: "Markdown" },
    );
  }
}

export async function handleCustomTargetInput(ctx: Context, text: string) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const targetCalories = parseInt(text.trim(), 10);
  if (isNaN(targetCalories) || targetCalories < 800 || targetCalories > 8000) {
    await ctx.reply(
      "⚠️ Masukkan angka target kalori yang realistis antara 800 - 8000 kkal (contoh: *2000*).",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const session = await sessionRepository.getSession(userId);
  const tempData = session.tempData;

  if (
    !tempData ||
    !tempData.gender ||
    !tempData.age ||
    !tempData.height ||
    !tempData.weight
  ) {
    await ctx.reply(
      "⚠️ Terjadi kesalahan sesi. Silakan ketik /start untuk mengulang.",
    );
    return;
  }

  await completeRegistration(ctx, userId, tempData, targetCalories);
}

async function completeRegistration(
  ctx: Context,
  userId: number,
  tempData: OnboardingTempData,
  targetCalories: number,
) {
  const username = ctx.from?.username || null;
  const metrics = calculateBodyMetrics(
    tempData.gender!,
    tempData.age!,
    tempData.height!,
    tempData.weight!,
  );

  await userRepository.createOrUpdate({
    id: userId,
    username,
    gender: tempData.gender!,
    age: tempData.age!,
    height: tempData.height!,
    weight: tempData.weight!,
    bmi: metrics.bmi,
    dailyCalorieTarget: targetCalories,
    status: "ACTIVE",
    timezone: "Asia/Jakarta",
  });

  await sessionRepository.clearSession(userId);

  await ctx.reply(
    `🎉 *Pendaftaran Selesai & Profil Aktif!* 🎉\n\n` +
      `👤 *Profil Kamu:*\n` +
      `• Jenis Kelamin: ${tempData.gender === "MALE" ? "Laki-laki" : "Perempuan"}\n` +
      `• Usia: ${tempData.age} tahun\n` +
      `• TB / BB: ${tempData.height} cm / ${tempData.weight} kg (BMI: ${metrics.bmi} - ${metrics.bmiCategory})\n` +
      `• Target Kalori Harian: *${targetCalories} kkal*\n\n` +
      `📸 *Mulai Logging Makanan:*\n` +
      `Kirimkan foto makanan atau minumanmu ke chat ini kapan saja! Cal akan otomatis menganalisis porsi dan kalorinya untukmu.\n\n` +
      `Gunakan tombol menu di bawah untuk akses cepat menu bot!`,
    { parse_mode: "Markdown", reply_markup: getMainReplyKeyboard() },
  );
}
