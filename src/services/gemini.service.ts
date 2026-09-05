import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { getEnv } from "../config/env.js";

export const foodAnalysisSchema = z.object({
  food_name: z.string().describe("Nama ringkas hidangan atau menu utama"),
  portion_description: z
    .string()
    .describe("Deskripsi porsi yang teridentifikasi"),
  calories: z
    .number()
    .int()
    .nonnegative()
    .describe("Estimasi total kalori dalam kkal"),
  macros: z.object({
    protein_g: z.number().nonnegative().describe("Estimasi protein dalam gram"),
    carbs_g: z
      .number()
      .nonnegative()
      .describe("Estimasi karbohidrat dalam gram"),
    fat_g: z.number().nonnegative().describe("Estimasi lemak dalam gram"),
  }),
  confidence_note: z
    .string()
    .describe("Catatan singkat mengenai estimasi nutrisi"),
});

export type FoodAnalysisResult = z.infer<typeof foodAnalysisSchema>;

const SYSTEM_PROMPT = `You are an expert clinical dietitian and food calorie estimation assistant.
Your job is to accurately identify food items from images combined with optional user context/notes.

Requirements:
1. Identify all food and beverage components on the plate/scene.
2. Consider user notes (e.g., portion size, specific ingredients, cooking method).
3. If an item is ambiguous, provide the most plausible Indonesian/common nutritional baseline estimate.
4. Output strict JSON matching the schema. Do not include markdown codeblocks or conversational filler.`;

export class GeminiService {
  private ai: GoogleGenAI;
  private modelName: string;

  constructor(apiKey?: string, modelName: string = "gemini-3.5-flash-lite") {
    const key = apiKey || getEnv().GEMINI_API_KEY;
    this.ai = new GoogleGenAI({ apiKey: key });
    this.modelName = modelName;
  }

  /**
   * Helper function to execute Gemini API calls with auto-retry on 503/429/UNAVAILABLE errors
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 2,
    delayMs: number = 2000,
  ): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (err: any) {
        lastError = err;
        const errMessage = String(err?.message || "");
        const status = err?.status || err?.code || "";
        const isUnavailable =
          status === 503 ||
          status === 429 ||
          status === "UNAVAILABLE" ||
          errMessage.includes("503") ||
          errMessage.includes("high demand") ||
          errMessage.includes("UNAVAILABLE") ||
          errMessage.includes("Resource has been exhausted");

        if (isUnavailable && attempt <= maxRetries) {
          console.warn(
            `⚠️ Gemini API busy (503/high demand). Retrying attempt ${attempt}/${maxRetries} after ${delayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        throw err;
      }
    }
    throw lastError;
  }

  /**
   * Analyzes food from an image buffer and an optional user note.
   */
  async analyzeFoodImage(
    imageBuffer: Buffer,
    mimeType: string = "image/jpeg",
    userNote?: string,
  ): Promise<FoodAnalysisResult> {
    const promptText =
      userNote && userNote.trim().length > 0
        ? `User provided context/note about this food: "${userNote.trim()}". Please analyze the image and the note to estimate the nutritional breakdown accurately.`
        : `Please analyze this food image and estimate the nutritional breakdown accurately.`;

    const base64Data = imageBuffer.toString("base64");

    const response = await this.executeWithRetry(() =>
      this.ai.models.generateContent({
        model: this.modelName,
        contents: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          promptText,
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              food_name: {
                type: Type.STRING,
                description: "Nama ringkas hidangan atau menu utama",
              },
              portion_description: {
                type: Type.STRING,
                description: "Deskripsi porsi yang teridentifikasi",
              },
              calories: {
                type: Type.INTEGER,
                description: "Estimasi total kalori dalam kkal",
              },
              macros: {
                type: Type.OBJECT,
                properties: {
                  protein_g: {
                    type: Type.NUMBER,
                    description: "Protein dalam gram",
                  },
                  carbs_g: {
                    type: Type.NUMBER,
                    description: "Karbohidrat dalam gram",
                  },
                  fat_g: {
                    type: Type.NUMBER,
                    description: "Lemak dalam gram",
                  },
                },
                required: ["protein_g", "carbs_g", "fat_g"],
              },
              confidence_note: {
                type: Type.STRING,
                description: "Catatan estimasi nutrisi",
              },
            },
            required: [
              "food_name",
              "portion_description",
              "calories",
              "macros",
              "confidence_note",
            ],
          },
        },
      }),
    );

    const text = response.text;
    if (!text) {
      throw new Error("No response returned from Gemini API");
    }

    try {
      // In case there are markdown code fences despite responseMimeType
      const cleanJson = text
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(cleanJson);
      return foodAnalysisSchema.parse(parsed);
    } catch (parseError) {
      console.error("Failed to parse Gemini response JSON:", text, parseError);
      throw new Error("Gagal mengurai respons nutrisi dari Gemini API.");
    }
  }

  /**
   * Analyzes food from a pure textual description (e.g. "Tadi siang makan nasi padang rendang dan es teh tawar").
   */
  async analyzeFoodText(textDescription: string): Promise<FoodAnalysisResult> {
    const promptText = `Estimate the nutritional breakdown for this food/beverage described by the user: "${textDescription.trim()}". Identify the components, estimate standard portion sizes, calculate calories in kcal, and estimate macronutrients (protein, carbs, fat in grams).`;

    const response = await this.executeWithRetry(() =>
      this.ai.models.generateContent({
        model: this.modelName,
        contents: [promptText],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              food_name: {
                type: Type.STRING,
                description: "Nama ringkas hidangan atau menu utama",
              },
              portion_description: {
                type: Type.STRING,
                description: "Deskripsi porsi yang teridentifikasi",
              },
              calories: {
                type: Type.INTEGER,
                description: "Estimasi total kalori dalam kkal",
              },
              macros: {
                type: Type.OBJECT,
                properties: {
                  protein_g: {
                    type: Type.NUMBER,
                    description: "Protein dalam gram",
                  },
                  carbs_g: {
                    type: Type.NUMBER,
                    description: "Karbohidrat dalam gram",
                  },
                  fat_g: {
                    type: Type.NUMBER,
                    description: "Lemak dalam gram",
                  },
                },
                required: ["protein_g", "carbs_g", "fat_g"],
              },
              confidence_note: {
                type: Type.STRING,
                description: "Catatan estimasi nutrisi",
              },
            },
            required: [
              "food_name",
              "portion_description",
              "calories",
              "macros",
              "confidence_note",
            ],
          },
        },
      }),
    );

    const text = response.text;
    if (!text) {
      throw new Error("No response returned from Gemini API");
    }

    try {
      const cleanJson = text
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(cleanJson);
      return foodAnalysisSchema.parse(parsed);
    } catch (parseError) {
      console.error(
        "Failed to parse Gemini text response JSON:",
        text,
        parseError,
      );
      throw new Error("Gagal mengurai respons nutrisi dari Gemini API.");
    }
  }
}

export const geminiService = new GeminiService();
