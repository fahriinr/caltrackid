import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "../config/env.js";
import * as schema from "./schema.js";

let dbInstance: PostgresJsDatabase<typeof schema> | null = null;
let clientInstance: postgres.Sql | null = null;

export function getDatabase(dbUrl?: string): PostgresJsDatabase<typeof schema> {
  if (dbInstance) {
    return dbInstance;
  }

  const url = dbUrl || getEnv().DATABASE_URL;

  // Serverless-optimized settings: max 1 connection per lambda container, zero prepare overhead
  const isServerless =
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

  clientInstance = postgres(url, {
    prepare: false,
    max: isServerless ? 1 : 10,
    idle_timeout: isServerless ? 5 : 20,
    connect_timeout: 10,
    ssl: { rejectUnauthorized: false },
  });

  dbInstance = drizzle(clientInstance, { schema });
  return dbInstance;
}

export function closeDatabase(): void {
  if (clientInstance) {
    clientInstance.end();
    clientInstance = null;
    dbInstance = null;
  }
}

export { schema };
