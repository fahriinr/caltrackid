import { geminiUsageRepository } from "../repositories/gemini-usage.repository.js";

// Whitelisted admin user IDs (unlimited quota & bypass)
export const ADMIN_USER_IDS = new Set<number>([1316054419]);

export const LIMITS = {
  USER_DAILY_PHOTOS: 8,
  GLOBAL_MINUTE_REQUESTS: 12,
  GLOBAL_DAILY_REQUESTS: 1200,
};

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: "USER_DAILY_LIMIT" | "GLOBAL_MINUTE_LIMIT" | "GLOBAL_DAILY_LIMIT";
  message?: string;
  waitSeconds?: number;
}

/**
 * Checks whether a user can perform a photo scan based on user and global limits
 */
export async function checkPhotoScanRateLimit(
  userId: number,
  zone: string = "Asia/Jakarta",
): Promise<RateLimitCheckResult> {
  // 1. Check if user is whitelisted admin
  if (ADMIN_USER_IDS.has(userId)) {
    return { allowed: true };
  }

  // 2. Check individual user daily limit (8 scans/day)
  const userTodayPhotos = await geminiUsageRepository.getUserTodayPhotoCount(
    userId,
    zone,
  );
  if (userTodayPhotos >= LIMITS.USER_DAILY_PHOTOS) {
    return {
      allowed: false,
      reason: "USER_DAILY_LIMIT",
      message:
        `🚫 *Batas Kuota Scan Foto Tercapai*\n\n` +
        `Kamu telah mencapai batas maksimal pemindaian foto hari ini (*${LIMITS.USER_DAILY_PHOTOS}/${LIMITS.USER_DAILY_PHOTOS} kali*).\n\n` +
        `💡 *Solusi:*\n` +
        `• Kuota foto akan di-reset besok pukul *00:00 WIB*.\n` +
        `• Hari ini kamu tetap bisa mencatat makanan dengan teks menggunakan perintah \`/catat <makanan>\` atau ketik langsung di chat.`,
    };
  }

  // 3. Check global requests per minute (< 12 req/min)
  const recentMinuteCount =
    await geminiUsageRepository.getGlobalRecentMinuteCount();
  if (recentMinuteCount >= LIMITS.GLOBAL_MINUTE_REQUESTS) {
    return {
      allowed: false,
      reason: "GLOBAL_MINUTE_LIMIT",
      waitSeconds: 20,
      message:
        `⏳ *Antrean AI Sedang Penuh (Waitlist)*\n\n` +
        `Server saat ini sedang memproses banyak permintaan secara bersamaan (*${recentMinuteCount} req/menit*).\n\n` +
        `👉 Mohon tunggu sekitar *15–30 detik*, lalu kirimkan kembali foto makananmu.`,
    };
  }

  // 4. Check global daily limit (< 1200 req/day)
  const globalTodayCount =
    await geminiUsageRepository.getGlobalTodayCount(zone);
  if (globalTodayCount >= LIMITS.GLOBAL_DAILY_REQUESTS) {
    return {
      allowed: false,
      reason: "GLOBAL_DAILY_LIMIT",
      message:
        `⚠️ *Kapasitas Harian Server Penuh*\n\n` +
        `Sistem AI telah mencapai batas pemindaian global untuk hari ini demi menjaga stabilitas layanan.\n\n` +
        `Silakan coba kembali besok hari atau gunakan pencatatan manual via teks (\`/catat\`).`,
    };
  }

  return { allowed: true };
}
