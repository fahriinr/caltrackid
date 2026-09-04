import {
  pgTable,
  bigint,
  varchar,
  integer,
  doublePrecision,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey(), // Telegram Chat / User ID (64-bit int)
  username: varchar("username", { length: 255 }),
  gender: varchar("gender", { length: 10 }).notNull(), // 'MALE' / 'FEMALE'
  age: integer("age").notNull(),
  height: doublePrecision("height").notNull(), // cm
  weight: doublePrecision("weight").notNull(), // kg
  bmi: doublePrecision("bmi").notNull(),
  dailyCalorieTarget: integer("daily_calorie_target").notNull(),
  status: varchar("status", { length: 20 }).default("ACTIVE").notNull(), // 'ACTIVE' / 'INACTIVE'
  timezone: varchar("timezone", { length: 50 })
    .default("Asia/Jakarta")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const foodLogs = pgTable("food_logs", {
  id: varchar("id", { length: 64 }).primaryKey(), // UUID
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  foodName: varchar("food_name", { length: 255 }).notNull(),
  portionDescription: text("portion_description"),
  calories: integer("calories").notNull(),
  protein: doublePrecision("protein").default(0).notNull(),
  carbs: doublePrecision("carbs").default(0).notNull(),
  fat: doublePrecision("fat").default(0).notNull(),
  confidenceNote: text("confidence_note"),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  loggedAt: timestamp("logged_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userSessions = pgTable("user_sessions", {
  userId: bigint("user_id", { mode: "number" }).primaryKey(),
  step: varchar("step", { length: 50 }).notNull(),
  pendingPhotoId: text("pending_photo_id"),
  tempData: text("temp_data"), // JSON string
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type FoodLog = typeof foodLogs.$inferSelect;
export type NewFoodLog = typeof foodLogs.$inferInsert;
export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;
