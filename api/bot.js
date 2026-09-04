import { webhookCallback } from "grammy";
import { createBot } from "../src/bot/bot.js";
import { runMigrations } from "../src/db/migrate.js";
const bot = createBot();
// Ensure DB schema migrations have run once per cold start
let migrated = false;
async function ensureMigrated() {
    if (!migrated) {
        await runMigrations();
        migrated = true;
    }
}
// Vercel Serverless Function Handler
export default async function handler(req, res) {
    if (req.method === "GET") {
        return res.status(200).send("🥗 NutriBot Webhook is alive and running!");
    }
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }
    try {
        await ensureMigrated();
        return await webhookCallback(bot, "express")(req, res);
    }
    catch (err) {
        console.error("Webhook processing error:", err);
        return res.status(500).json({ error: err.message || "Internal Server Error" });
    }
}
//# sourceMappingURL=bot.js.map