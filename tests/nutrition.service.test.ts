import { describe, it, expect } from "vitest";
import { calculateBodyMetrics } from "../src/services/nutrition.service.js";

describe("Nutrition Service - Body Metrics", () => {
  it("should accurately calculate BMI and metrics for a normal weight male", () => {
    // 70kg, 175cm (1.75m), 25yo male
    // BMI = 70 / (1.75 * 1.75) = 70 / 3.0625 = 22.86 -> 22.9
    // BMR = 10*70 + 6.25*175 - 5*25 + 5 = 700 + 1093.75 - 125 + 5 = 1673.75 -> 1674
    // TDEE = 1674 * 1.2 = 2008.8 -> 2009
    const metrics = calculateBodyMetrics("MALE", 25, 175, 70);

    expect(metrics.bmi).toBe(22.9);
    expect(metrics.bmiCategory).toBe("Ideal");
    expect(metrics.bmr).toBe(1674);
    expect(metrics.tdee).toBe(2009);
    expect(metrics.recommendedCalories).toBe(2009);
  });

  it("should calculate overweight female metrics with a safe calorie deficit", () => {
    // 75kg, 160cm (1.6m), 30yo female
    // BMI = 75 / (1.6 * 1.6) = 75 / 2.56 = 29.3
    // BMR = 10*75 + 6.25*160 - 5*30 - 161 = 750 + 1000 - 150 - 161 = 1439
    // TDEE = 1439 * 1.2 = 1726.8 -> 1727
    // Recommended = max(1200, 1727 - 400) = 1327
    const metrics = calculateBodyMetrics("FEMALE", 30, 160, 75);

    expect(metrics.bmi).toBe(29.3);
    expect(metrics.bmiCategory).toBe("Overweight");
    expect(metrics.bmr).toBe(1439);
    expect(metrics.tdee).toBe(1727);
    expect(metrics.recommendedCalories).toBe(1327);
  });

  it("should calculate underweight male metrics with a surplus", () => {
    // 48kg, 175cm (1.75m), 20yo male
    // BMI = 48 / 3.0625 = 15.67 -> 15.7
    const metrics = calculateBodyMetrics("MALE", 20, 175, 48);

    expect(metrics.bmi).toBe(15.7);
    expect(metrics.bmiCategory).toBe("Underweight");
    expect(metrics.recommendedCalories).toBe(metrics.tdee + 350);
  });

  it("should calculate obese category correctly", () => {
    // 110kg, 170cm, 35yo male
    // BMI = 110 / 2.89 = 38.1
    const metrics = calculateBodyMetrics("MALE", 35, 170, 110);

    expect(metrics.bmi).toBe(38.1);
    expect(metrics.bmiCategory).toBe("Obesitas");
    expect(metrics.recommendedCalories).toBeLessThan(metrics.tdee);
  });
});
