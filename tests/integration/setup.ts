/**
 * Integration test setup
 * Loads .env.test and verifies database connectivity before tests run.
 */

import { resolve } from 'node:path';
import { vi } from 'vitest';
import { loadDotenvFileOrThrow } from '../shared/load-dotenv-file';

// Load .env.test from project root
loadDotenvFileOrThrow(resolve(__dirname, '../../.env.test'));

vi.mock('server-only', () => ({}));

// Fail fast if the test database is unreachable.
// Without this check, a missing/misconfigured Docker container causes
// 50+ cryptic timeouts instead of one clear error message.
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl) {
  const { default: postgres } = await import('postgres');
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 3 });
  try {
    await sql`SELECT 1`;
  } catch (error) {
    const url = new URL(databaseUrl);
    const message = [
      `Cannot connect to test database at ${url.hostname}:${url.port}.`,
      '',
      'Run: pnpm db:test:up',
      '',
      `Then migrate: DATABASE_URL=${databaseUrl} pnpm db:migrate`,
    ].join('\n');
    throw new Error(message, { cause: error });
  } finally {
    await sql.end({ timeout: 1 });
  }
}
