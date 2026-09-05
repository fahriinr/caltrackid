import { Bot } from "grammy";
import { getEnv } from "../config/env.js";
import { createThrottleMiddleware } from "./middlewares/throttle.middleware.js";
import { createLoggerMiddleware } from "./middlewares/logger.middleware.js";
import {
  handleStartCommand,
  startOnboardingFlow,
  handleGenderCallback,
  handleAgeInput,
  handleHeightInput,
  handleWeightInput,
  handleTargetChoiceCallback,
  handleCustomTargetInput,
} from "./handlers/start.handler.js";
import {
  handlePhotoReceived,
  handleSkipFoodNoteCallback,
  handleFoodNoteText,
  handleConfirmFoodSaveCallback,
  handleCorrectFoodManualCallback,
  handleCancelFoodEntryCallback,
  handleFoodCorrectionText,
  handleDeleteLogCallback,
  processTextFoodAnalysis,
} from "./handlers/photo.handler.js";
import {
  handleTodayCommand,
  handleManageLogsCallback,
} from "./handlers/today.handler.js";
import { handleWeekCommand } from "./handlers/week.handler.js";
import {
  handleProfileCommand,
  handleSetTargetCommand,
  handleTargetUpdateInput,
} from "./handlers/profile.handler.js";
import {
  handleHelpCommand,
  handleCancelCommand,
} from "./handlers/help.handler.js";
import { sessionRepository } from "../repositories/session.repository.js";
import { userRepository } from "../repositories/user.repository.js";

export function createBot(token?: string): Bot {
  const botToken = token || getEnv().TELEGRAM_BOT_TOKEN;
  const bot = new Bot(botToken);

  // Apply middlewares
  bot.use(createLoggerMiddleware());
  bot.use(createThrottleMiddleware());

  // Commands
  bot.command("start", handleStartCommand);
  bot.command("today", handleTodayCommand);
  bot.command(["week", "minggu"], handleWeekCommand);
  bot.command("profile", handleProfileCommand);
  bot.command("settarget", handleSetTargetCommand);
  bot.command("help", handleHelpCommand);
  bot.command("cancel", handleCancelCommand);

  // Direct text logging commands (/catat or /log)
  bot.command(["catat", "log"], async (ctx) => {
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

    const text = ctx.message?.text || "";
    // Remove command name, e.g. "/catat " or "/log "
    const foodDescription = text.replace(/^\/(catat|log)(@\w+)?/i, "").trim();

    if (foodDescription.length > 0) {
      await processTextFoodAnalysis(ctx, userId, foodDescription);
    } else {
      await sessionRepository.setSession(userId, {
        step: "AWAITING_FOOD_CORRECTION",
        pendingPhotoId: null,
      });
      await ctx.reply(
        `📝 *Catat Makanan via Teks*\n\n` +
          `Ketik nama makanan dan porsinya yang kamu konsumsi:\n` +
          `_(Contoh: "Tadi siang makan nasi goreng telur 1 porsi, es teh manis")_`,
        { parse_mode: "Markdown" },
      );
    }
  });

  // Callback queries
  bot.callbackQuery("gender_MALE", async (ctx) =>
    handleGenderCallback(ctx, "MALE"),
  );
  bot.callbackQuery("gender_FEMALE", async (ctx) =>
    handleGenderCallback(ctx, "FEMALE"),
  );

  bot.callbackQuery("target_use_recommended", async (ctx) =>
    handleTargetChoiceCallback(ctx, "use_recommended"),
  );
  bot.callbackQuery("target_custom", async (ctx) =>
    handleTargetChoiceCallback(ctx, "custom"),
  );

  bot.callbackQuery("skip_food_note", handleSkipFoodNoteCallback);
  bot.callbackQuery("confirm_food_save", handleConfirmFoodSaveCallback);
  bot.callbackQuery("correct_food_manual", handleCorrectFoodManualCallback);
  bot.callbackQuery("cancel_food_entry", handleCancelFoodEntryCallback);

  bot.callbackQuery("action_today", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleTodayCommand(ctx);
  });
  bot.callbackQuery("action_week", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleWeekCommand(ctx);
  });
  bot.callbackQuery("action_manage_logs", handleManageLogsCallback);

  // Dynamic delete log callback (delete_log_<uuid>)
  bot.callbackQuery(/^delete_log_(.+)$/, async (ctx) => {
    const match = ctx.match;
    const logId = match[1];
    await handleDeleteLogCallback(ctx, logId);
  });
  bot.callbackQuery("action_profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleProfileCommand(ctx);
  });
  bot.callbackQuery("action_change_target", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleSetTargetCommand(ctx);
  });
  bot.callbackQuery("action_restart_onboarding", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id;
    if (userId) {
      await startOnboardingFlow(ctx, userId);
    }
  });

  // Photo message handler
  bot.on("message:photo", handlePhotoReceived);

  // Text message handler (dispatched based on session state)
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return; // Skip commands

    const userId = ctx.from.id;

    // Handle Reply Keyboard Menu Button presses & Back/Cancel intents
    if (text === "🍽️ Catat Makanan" || text.toLowerCase() === "catat makanan") {
      await sessionRepository.clearSession(userId);
      await ctx.reply(
        `📸 *Cara Catat Makanan:*\n\n` +
          `1. *Kirim Foto Langsung:* Cukup ambil/kirimkan foto makananmu ke chat ini.\n` +
          `2. *Ketik Teks Manual:* Ketik nama makanan & porsinya langsung di chat atau gunakan format:\n` +
          `   \`/catat <nama makanan & porsi>\`\n` +
          `   _(Contoh: "Nasi padang ayam bakar, es teh tawar")_`,
        { parse_mode: "Markdown" },
      );
      return;
    }

    if (
      text === "📊 Rekap Hari Ini" ||
      text.toLowerCase() === "rekap hari ini"
    ) {
      await sessionRepository.clearSession(userId);
      await handleTodayCommand(ctx);
      return;
    }

    if (
      text === "👤 Profile" ||
      text.toLowerCase() === "profile" ||
      text.toLowerCase() === "profil"
    ) {
      await sessionRepository.clearSession(userId);
      await handleProfileCommand(ctx);
      return;
    }

    if (
      text === "❓ Help" ||
      text.toLowerCase() === "help" ||
      text.toLowerCase() === "bantuan"
    ) {
      await sessionRepository.clearSession(userId);
      await handleHelpCommand(ctx);
      return;
    }

    if (
      text.toLowerCase() === "kembali" ||
      text.toLowerCase() === "batal" ||
      text.toLowerCase() === "back" ||
      text.toLowerCase() === "cancel"
    ) {
      await sessionRepository.clearSession(userId);
      await ctx.reply(
        "👌 Aksi telah dibatalkan. Silakan pilih menu di bawah atau kirim foto makanan kapan saja.",
        { parse_mode: "Markdown" },
      );
      return;
    }

    const session = await sessionRepository.getSession(userId);

    switch (session.step) {
      case "ONBOARDING_AGE":
        await handleAgeInput(ctx, text);
        break;
      case "ONBOARDING_HEIGHT":
        await handleHeightInput(ctx, text);
        break;
      case "ONBOARDING_WEIGHT":
        await handleWeightInput(ctx, text);
        break;
      case "AWAITING_CUSTOM_TARGET":
        await handleCustomTargetInput(ctx, text);
        break;
      case "AWAITING_FOOD_NOTE":
        await handleFoodNoteText(ctx, text);
        break;
      case "AWAITING_FOOD_CONFIRMATION":
      case "AWAITING_FOOD_CORRECTION":
        await handleFoodCorrectionText(ctx, text);
        break;
      case "AWAITING_TARGET_UPDATE":
        await handleTargetUpdateInput(ctx, text);
        break;
      default: {
        // If user sent text in IDLE state, check if registered user and process as food description
        const user = await userRepository.findById(userId);
        if (user && user.status === "ACTIVE") {
          // If the text looks like a food entry or user typing meals
          await processTextFoodAnalysis(ctx, userId, text);
        } else {
          await ctx.reply(
            `👋 Halo! Silakan ketik /start untuk mendaftarkan profil fisikmu terlebih dahulu.`,
            { parse_mode: "Markdown" },
          );
        }
        break;
      }
    }
  });

  // Error boundary
  bot.catch((err) => {
    console.error("Error in Telegram bot:", err);
  });

  return bot;
}

export async function setupBotCommands(bot: Bot) {
  try {
    await bot.api.setMyCommands([
      {
        command: "today",
        description: "Rekap kalori & nutrisi hari ini",
      },
      {
        command: "week",
        description: "Rekap kalori per hari selama 7 hari",
      },
      {
        command: "catat",
        description: "Catat makanan via teks (tanpa foto)",
      },
      { command: "profile", description: "Lihat data fisik & target kalori" },
      { command: "settarget", description: "Ubah target kalori harian" },
      { command: "help", description: "Panduan cara penggunaan bot" },
      { command: "cancel", description: "Batalkan aksi yang sedang berjalan" },
      { command: "start", description: "Mulai / daftar ulang profil" },
    ]);
  } catch (err) {
    console.warn("Failed to set bot commands menu:", err);
  }
}
