import { Bot } from "grammy";
import { getEnv } from "../config/env.js";
import { createThrottleMiddleware } from "./middlewares/throttle.middleware.js";
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
} from "./handlers/photo.handler.js";
import { handleTodayCommand } from "./handlers/today.handler.js";
import {
  handleProfileCommand,
  handleSetTargetCommand,
  handleTargetUpdateInput,
} from "./handlers/profile.handler.js";
import { handleHelpCommand, handleCancelCommand } from "./handlers/help.handler.js";
import { sessionRepository } from "../repositories/session.repository.js";

export function createBot(token?: string): Bot {
  const botToken = token || getEnv().TELEGRAM_BOT_TOKEN;
  const bot = new Bot(botToken);

  // Apply rate limiter middleware
  bot.use(createThrottleMiddleware());

  // Commands
  bot.command("start", handleStartCommand);
  bot.command("today", handleTodayCommand);
  bot.command("profile", handleProfileCommand);
  bot.command("settarget", handleSetTargetCommand);
  bot.command("help", handleHelpCommand);
  bot.command("cancel", handleCancelCommand);

  // Callback queries
  bot.callbackQuery("gender_MALE", async (ctx) => handleGenderCallback(ctx, "MALE"));
  bot.callbackQuery("gender_FEMALE", async (ctx) => handleGenderCallback(ctx, "FEMALE"));

  bot.callbackQuery("target_use_recommended", async (ctx) =>
    handleTargetChoiceCallback(ctx, "use_recommended")
  );
  bot.callbackQuery("target_custom", async (ctx) =>
    handleTargetChoiceCallback(ctx, "custom")
  );

  bot.callbackQuery("skip_food_note", handleSkipFoodNoteCallback);
  bot.callbackQuery("action_today", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleTodayCommand(ctx);
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
      case "AWAITING_TARGET_UPDATE":
        await handleTargetUpdateInput(ctx, text);
        break;
      default:
        // User sent regular text outside active session
        await ctx.reply(
          `📸 Kirimkan *foto makanan* untuk mencatat kalori secara otomatis,\n` +
          `atau gunakan perintah:\n` +
          `• /today - Rekap kalori hari ini\n` +
          `• /profile - Info profil & target\n` +
          `• /help - Panduan lengkap`,
          { parse_mode: "Markdown" }
        );
        break;
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
      { command: "today", description: "Lihat rekap kalori & nutrisi hari ini" },
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
