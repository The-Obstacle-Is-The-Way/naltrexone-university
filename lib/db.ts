import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { POSTGRES_CONNECTION_PARAMETERS } from './db-connection-options';
import { env } from './env';

const connectionString = env.DATABASE_URL;

// Singleton pattern for connection pooling
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const conn =
  globalForDb.conn ??
  postgres(connectionString, { connection: POSTGRES_CONNECTION_PARAMETERS });
if (process.env.NODE_ENV !== 'production') {
  globalForDb.conn = conn;
}

export const db = drizzle(conn, { schema });
