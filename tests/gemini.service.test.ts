import { describe, it, expect } from "vitest";
import { foodAnalysisSchema } from "../src/services/gemini.service.js";

describe("Gemini Service Schema Validation", () => {
  it("should validate a correct Gemini structured JSON response", () => {
    const rawJson = {
      food_name: "Sate Ayam Madura",
      portion_description: "10 tusuk dengan bumbu kacang dan lontong",
      calories: 620,
      macros: {
        protein_g: 38.5,
        carbs_g: 45.0,
        fat_g: 22.0,
      },
      confidence_note: "Estimasi berdasarkan sate ayam standar dengan lontong",
    };

    const parsed = foodAnalysisSchema.parse(rawJson);
    expect(parsed.food_name).toBe("Sate Ayam Madura");
    expect(parsed.calories).toBe(620);
    expect(parsed.macros.protein_g).toBe(38.5);
    expect(parsed.macros.carbs_g).toBe(45.0);
    expect(parsed.macros.fat_g).toBe(22.0);
  });

  it("should reject invalid food schema (e.g. missing macros)", () => {
    const invalidJson = {
      food_name: "Salad",
      portion_description: "1 mangkuk",
      calories: 150,
      // missing macros
      confidence_note: "Fresh salad",
    };

    expect(() => foodAnalysisSchema.parse(invalidJson)).toThrow();
  });
});
