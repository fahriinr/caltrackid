import { Context, NextFunction } from "grammy";

// Simple in-memory rate limiter per user (prevents spamming photo analysis or commands)
const userLastActionMap = new Map<number, number>();

export function createThrottleMiddleware(minIntervalMs: number = 1000) {
  return async (ctx: Context, next: NextFunction) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return next();
    }

    const now = Date.now();
    const lastAction = userLastActionMap.get(userId);

    // If message contains photo, apply a slightly larger throttle (e.g. 2s) to prevent spam
    const requiredInterval = ctx.message?.photo ? Math.max(minIntervalMs, 2500) : minIntervalMs;

    if (lastAction && now - lastAction < requiredInterval) {
      if (ctx.message?.photo) {
        await ctx.reply("⏳ Mohon tunggu sebentar sebelum mengirim permintaan berikutnya.");
      }
      return;
    }

    userLastActionMap.set(userId, now);

    // Clean up old entries periodically
    if (userLastActionMap.size > 10000) {
      for (const [id, time] of userLastActionMap.entries()) {
        if (now - time > 60000) {
          userLastActionMap.delete(id);
        }
      }
    }

    return next();
  };
}
