import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '@/db/schema';

// DEBT-483: a fresh database in the clone's own Postgres, with every
// migration applied and nothing else. Release commands activate releases,
// and an activation archives every published question a release leaves out,
// so their committed paths run here rather than in the shared, seeded
// database. Drop it in afterAll.
export async function createDisposableDatabase(
  options: { migrationsFolder?: string } = {},
) {
  const configuredUrl = process.env.DATABASE_URL;
  if (!configuredUrl) throw new Error('DATABASE_URL is required');
  const baseUrl: string = configuredUrl;
  const name = `it_disposable_${randomUUID().replaceAll('-', '')}`;
  const admin = postgres(baseUrl, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  async function drop(): Promise<void> {
    await sql.end({ timeout: 5 });
    const dropper = postgres(baseUrl, { max: 1, onnotice: () => {} });
    try {
      await dropper.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await dropper.end({ timeout: 5 });
    }
  }
  try {
    await migrate(db, {
      migrationsFolder:
        options.migrationsFolder ??
        path.resolve(process.cwd(), 'db/migrations'),
    });
  } catch (error) {
    try {
      await drop();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Disposable migration and cleanup failed',
        { cause: error },
      );
    }
    throw error;
  }
  return { url: url.toString(), db, drop };
}
