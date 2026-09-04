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

  // prepare: false is required for Supabase transaction pooler (port 6543) and also fully compatible with session pooler (port 5432)
  clientInstance = postgres(url, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 15,
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
