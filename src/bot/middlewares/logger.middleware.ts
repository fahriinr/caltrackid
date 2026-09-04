import { Context, NextFunction } from "grammy";

function resolveUpdateType(ctx: Context): string {
  if (ctx.message?.photo) return "photo";
  if (ctx.message?.text) {
    const text = ctx.message.text;
    if (text.startsWith("/"))
      return `command:${text.split(" ")[0].split("@")[0]}`;
    return "text";
  }
  if (ctx.callbackQuery) return `callback:${ctx.callbackQuery.data ?? "?"}`;
  if (ctx.message?.sticker) return "sticker";
  if (ctx.message?.document) return "document";
  return "other";
}

export function createLoggerMiddleware() {
  return async (ctx: Context, next: NextFunction) => {
    const start = Date.now();
    const userId = ctx.from?.id ?? "anon";
    const username = ctx.from?.username
      ? `@${ctx.from.username}`
      : (ctx.from?.first_name ?? "unknown");
    const updateType = resolveUpdateType(ctx);

    console.log(`[CAL] → ${updateType} | user=${userId} (${username})`);

    try {
      await next();
      const ms = Date.now() - start;
      console.log(`[CAL] ✓ ${updateType} | user=${userId} | ${ms}ms`);
    } catch (err: any) {
      const ms = Date.now() - start;
      console.error(
        `[CAL] ✗ ${updateType} | user=${userId} | ${ms}ms | error=${err?.message ?? err}`,
      );
      throw err;
    }
  };
}
