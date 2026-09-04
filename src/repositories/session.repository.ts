import { eq, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import { userSessions } from "../db/schema.js";

export type SessionStep =
  | "IDLE"
  | "ONBOARDING_GENDER"
  | "ONBOARDING_AGE"
  | "ONBOARDING_HEIGHT"
  | "ONBOARDING_WEIGHT"
  | "ONBOARDING_TARGET_CHOICE"
  | "AWAITING_CUSTOM_TARGET"
  | "AWAITING_FOOD_NOTE"
  | "AWAITING_FOOD_CONFIRMATION"
  | "AWAITING_FOOD_CORRECTION"
  | "AWAITING_TARGET_UPDATE";

export interface PendingFoodAnalysis {
  food_name: string;
  portion_description: string;
  calories: number;
  macros: {
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  confidence_note: string;
  userNote?: string;
}

export interface SessionTempData {
  gender?: "MALE" | "FEMALE";
  age?: number;
  height?: number;
  weight?: number;
  bmi?: number;
  recommendedCalories?: number;
  tdee?: number;
  bmr?: number;
  pendingFood?: PendingFoodAnalysis;
}

export type OnboardingTempData = SessionTempData;

export interface SessionData {
  step: SessionStep;
  pendingPhotoId?: string | null;
  tempData?: SessionTempData | null;
}

export class SessionRepository {
  async getSession(userId: number): Promise<SessionData> {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, userId))
      .limit(1);
    const row = rows[0];

    if (!row) {
      return { step: "IDLE", pendingPhotoId: null, tempData: null };
    }

    let parsedTemp: SessionTempData | null = null;
    if (row.tempData) {
      try {
        parsedTemp = JSON.parse(row.tempData);
      } catch {
        parsedTemp = null;
      }
    }

    return {
      step: row.step as SessionStep,
      pendingPhotoId: row.pendingPhotoId,
      tempData: parsedTemp,
    };
  }

  async setSession(userId: number, data: Partial<SessionData>): Promise<void> {
    const db = getDatabase();
    const current = await this.getSession(userId);

    const step = data.step ?? current.step ?? "IDLE";
    const pendingPhotoId =
      data.pendingPhotoId !== undefined
        ? data.pendingPhotoId
        : current.pendingPhotoId;
    const tempDataObj =
      data.tempData !== undefined ? data.tempData : current.tempData;
    const tempDataStr = tempDataObj ? JSON.stringify(tempDataObj) : null;

    await db
      .insert(userSessions)
      .values({
        userId,
        step,
        pendingPhotoId,
        tempData: tempDataStr,
        updatedAt: sql`NOW()`,
      })
      .onConflictDoUpdate({
        target: userSessions.userId,
        set: {
          step,
          pendingPhotoId,
          tempData: tempDataStr,
          updatedAt: sql`NOW()`,
        },
      });
  }

  async clearSession(userId: number): Promise<void> {
    const db = getDatabase();
    await db
      .update(userSessions)
      .set({
        step: "IDLE",
        pendingPhotoId: null,
        tempData: null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(userSessions.userId, userId));
  }
}

export const sessionRepository = new SessionRepository();
