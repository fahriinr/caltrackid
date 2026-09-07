import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import { users, User, NewUser } from "../db/schema.js";

export interface PaginatedUsersResult {
  users: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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

  async updateStatus(
    userId: number,
    status: "ACTIVE" | "INACTIVE",
  ): Promise<User | null> {
    const db = getDatabase();
    const rows = await db
      .update(users)
      .set({
        status,
        updatedAt: sql`NOW()`,
      })
      .where(eq(users.id, userId))
      .returning();

    return rows[0] || null;
  }

  async updateNotificationPreference(
    userId: number,
    notificationsEnabled: boolean,
  ): Promise<User | null> {
    const db = getDatabase();
    const rows = await db
      .update(users)
      .set({
        notificationsEnabled,
        status: "ACTIVE", // keep user active
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

  async listRecapSubscribers(): Promise<User[]> {
    const db = getDatabase();
    return db
      .select()
      .from(users)
      .where(
        sql`${users.status} = 'ACTIVE' AND (${users.notificationsEnabled} IS TRUE OR ${users.notificationsEnabled} IS NULL)`,
      );
  }

  async getPaginatedUsers(options: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedUsersResult> {
    const db = getDatabase();
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));
    const offset = (page - 1) * limit;
    const search = options.search?.trim();

    const whereClause = search
      ? or(
          ilike(users.username, `%${search}%`),
          sql`CAST(${users.id} AS TEXT) LIKE ${`%${search}%`}`,
        )
      : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(whereClause);

    const total = countResult?.count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const userList = await db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      users: userList,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async countTotalUsers(): Promise<{ total: number; active: number }> {
    const db = getDatabase();
    const [res] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(case when ${users.status} = 'ACTIVE' then 1 end)::int`,
      })
      .from(users);

    return {
      total: res?.total || 0,
      active: res?.active || 0,
    };
  }
}

export const userRepository = new UserRepository();
