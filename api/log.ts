import { runMigrations } from "../src/db/migrate.js";
import { userRepository } from "../src/repositories/user.repository.js";
import { foodLogRepository } from "../src/repositories/food-log.repository.js";
import { geminiService } from "../src/services/gemini.service.js";

export default async function handler(req: any, res: any) {
  // CORS headers (MacroDroid HTTP action)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  const { userId, text } = req.body || {};

  // Validate
  if (!userId || typeof userId !== "number") {
    return res.status(400).json({ success: false, error: "userId (number) wajib diisi" });
  }
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ success: false, error: "text wajib diisi" });
  }

  try {
    await runMigrations();

    // Auth: cek user terdaftar & aktif
    const user = await userRepository.findById(userId);
    if (!user || user.status !== "ACTIVE") {
      return res.status(403).json({ success: false, error: "User tidak ditemukan atau tidak aktif" });
    }

    // Analisis via Gemini
    const { result, usedModel } = await geminiService.analyzeFoodText(text.trim());

    // Langsung simpan (skip konfirmasi — dari MacroDroid)
    const log = await foodLogRepository.create({
      userId,
      foodName: result.food_name,
      portionDescription: result.portion_description,
      calories: result.calories,
      protein: result.macros.protein_g,
      carbs: result.macros.carbs_g,
      fat: result.macros.fat_g,
      confidenceNote: result.confidence_note,
    });

    console.log(`[api/log] userId=${userId} model=${usedModel} food="${result.food_name}" cal=${result.calories}`);

    return res.status(200).json({
      success: true,
      data: {
        id: log.id,
        foodName: log.foodName,
        portionDescription: log.portionDescription,
        calories: log.calories,
        protein: log.protein,
        carbs: log.carbs,
        fat: log.fat,
        confidenceNote: log.confidenceNote,
        loggedAt: log.loggedAt,
        usedModel,
      },
    });
  } catch (err: any) {
    console.error("[api/log] error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
}
