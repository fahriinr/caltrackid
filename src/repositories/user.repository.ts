import { eq, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import { users, User, NewUser } from "../db/schema.js";

export class UserRepository {
  async findById(userId: number): Promise<User | null> {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] || null;
  }

  async createOrUpdate(data: NewUser & { id: number }): Promise<User> {
    const db = getDatabase();
    const existing = await this.findById(data.id);

    if (existing) {
      const rows = await db
        .update(users)
        .set({
          ...data,
          updatedAt: sql`NOW()`,
        })
        .where(eq(users.id, data.id))
        .returning();
      return rows[0];
    } else {
      const rows = await db.insert(users).values(data).returning();
      return rows[0];
    }
  }

  async updateTarget(
    userId: number,
    targetCalories: number,
  ): Promise<User | null> {
    const db = getDatabase();
    const rows = await db
      .update(users)
      .set({
        dailyCalorieTarget: targetCalories,
        updatedAt: sql`NOW()`,
      })
      .where(eq(users.id, userId))
      .returning();

    return rows[0] || null;
  }

  async listActiveUsers(): Promise<User[]> {
    const db = getDatabase();
    return db.select().from(users).where(eq(users.status, "ACTIVE"));
  }
}

export const userRepository = new UserRepository();
