import { getDatabase } from "./index.js";
import { sql } from "drizzle-orm";

export async function runMigrations(dbUrl?: string): Promise<void> {
  const db = getDatabase(dbUrl);

  // Initialize tables directly if not exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      username VARCHAR(255),
      gender VARCHAR(10) NOT NULL CHECK(gender IN ('MALE', 'FEMALE')),
      age INTEGER NOT NULL,
      height DOUBLE PRECISION NOT NULL,
      weight DOUBLE PRECISION NOT NULL,
      bmi DOUBLE PRECISION NOT NULL,
      daily_calorie_target INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
      timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS food_logs (
      id VARCHAR(64) PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      food_name VARCHAR(255) NOT NULL,
      portion_description TEXT,
      calories INTEGER NOT NULL,
      protein DOUBLE PRECISION NOT NULL DEFAULT 0,
      carbs DOUBLE PRECISION NOT NULL DEFAULT 0,
      fat DOUBLE PRECISION NOT NULL DEFAULT 0,
      confidence_note TEXT,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      user_id BIGINT PRIMARY KEY,
      step VARCHAR(50) NOT NULL,
      pending_photo_id TEXT,
      temp_data TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create indexes for faster queries
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_food_logs_user_logged ON food_logs(user_id, logged_at);`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);`,
  );

  console.log("✅ PostgreSQL Database schema initialized successfully.");
}

// If run directly
if (
  process.argv[1]?.endsWith("migrate.ts") ||
  process.argv[1]?.endsWith("migrate.js")
) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Migration failed:", err);
      process.exit(1);
    });
}
