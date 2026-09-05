import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  DATABASE_URL: z.string().default("./data/nutribot.db"),
  DEFAULT_TIMEZONE: z.string().default("Asia/Jakarta"),
  CRON_SECRET: z.string().optional(),
  DASHBOARD_USERNAME: z.string().default("admin"),
  DASHBOARD_PASSWORD: z.string().default("admin123"),
  DASHBOARD_SECRET: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

let envConfig: Env;

export function getEnv(): Env {
  if (!envConfig) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error("❌ Environment validation error:", parsed.error.format());
      throw new Error("Invalid environment variables");
    }
    envConfig = parsed.data;
  }
  return envConfig;
}
