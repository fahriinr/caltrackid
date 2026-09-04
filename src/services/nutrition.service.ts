export type Gender = "MALE" | "FEMALE";

export interface BodyMetrics {
  bmi: number;
  bmiCategory: "Underweight" | "Ideal" | "Overweight" | "Obesitas";
  bmiAdvice: string;
  bmr: number;
  tdee: number;
  recommendedCalories: number;
}

/**
 * Calculates BMI, BMR (Mifflin-St Jeor), TDEE, and recommended daily calories.
 */
export function calculateBodyMetrics(
  gender: Gender,
  age: number,
  heightCm: number,
  weightKg: number
): BodyMetrics {
  const heightM = heightCm / 100;
  const bmiRaw = weightKg / (heightM * heightM);
  const bmi = Math.round(bmiRaw * 10) / 10;

  let bmiCategory: BodyMetrics["bmiCategory"];
  let bmiAdvice: string;

  if (bmi < 18.5) {
    bmiCategory = "Underweight";
    bmiAdvice = "Berat badanmu kurang dari batas ideal. Disarankan surplus kalori sehat.";
  } else if (bmi < 25.0) {
    bmiCategory = "Ideal";
    bmiAdvice = "Berat badanmu ideal! Pertahankan asupan kalori seimbang.";
  } else if (bmi < 30.0) {
    bmiCategory = "Overweight";
    bmiAdvice = "Berat badanmu sedikit di atas ideal. Disarankan defisit kalori ringan.";
  } else {
    bmiCategory = "Obesitas";
    bmiAdvice = "Kategori obesitas. Disarankan defisit kalori bertahap & olahraga rutin.";
  }

  // Mifflin-St Jeor formula
  let bmr: number;
  if (gender === "MALE") {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }
  bmr = Math.round(bmr);

  // Sedentary activity level (multiplier 1.2) as baseline TDEE
  const tdee = Math.round(bmr * 1.2);

  // Calorie recommendation based on BMI
  let recommendedCalories = tdee;
  if (bmiCategory === "Overweight" || bmiCategory === "Obesitas") {
    // Deficit ~400 kcal, with safety minimums (1500 for men, 1200 for women)
    const minCal = gender === "MALE" ? 1500 : 1200;
    recommendedCalories = Math.max(minCal, tdee - 400);
  } else if (bmiCategory === "Underweight") {
    // Surplus ~350 kcal
    recommendedCalories = tdee + 350;
  }

  return {
    bmi,
    bmiCategory,
    bmiAdvice,
    bmr,
    tdee,
    recommendedCalories,
  };
}
