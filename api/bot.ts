import { webhookCallback } from "grammy";
import { createBot } from "../src/bot/bot.js";

// Lazy bot instantiation to prevent top-level unhandled initialization errors
let botInstance: ReturnType<typeof createBot> | null = null;
function getBot() {
  if (!botInstance) {
    botInstance = createBot();
  }
  return botInstance;
}

// Vercel Serverless Function Handler
export default async function handler(req: any, res: any) {
  if (req.method === "GET") {
    return res
      .status(200)
      .send("🥗 CalTrack (Cal) Webhook is alive and running!");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const bot = getBot();
    // Vercel Node.js Serverless Functions use Next.js/Vercel request/response format
    // Set webhookCallback timeout to 55s and onTimeout: "return" to avoid unhandled 10s timeout throw
    const handleUpdate = webhookCallback(bot, "next-js", "return", 55000);
    return await handleUpdate(req, res);
  } catch (err: any) {
    console.error("Webhook execution error:", err);
    return res.status(200).json({ error: err.message || "Error handled" });
  }
}
