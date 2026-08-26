/**
 * Integration test setup
 * Loads .env.test and verifies database connectivity before tests run.
 */

import { resolve } from 'node:path';
import postgres from 'postgres';
import { vi } from 'vitest';
import { loadDotenvFileOrThrow } from '../shared/load-dotenv-file';

// Load .env.test from project root
loadDotenvFileOrThrow(resolve(__dirname, '../../.env.test'));

vi.mock('server-only', () => ({}));

function isLocalDatabaseHost(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  );
}

function getDatabaseName(url: URL): string | null {
  const raw = url.pathname.replace(/^\//, '');
  return raw ? raw : null;
}

function buildSuggestedLocalDatabaseUrl(input: {
  hostname: string;
  port: string;
  dbName: string;
}): string {
  const suggested = new URL(
    'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
  );
  suggested.hostname = input.hostname;
  suggested.port = input.port;
  suggested.pathname = `/${input.dbName}`;
  return suggested.toString();
}

// Fail fast if the test database is unreachable.
// Without this check, a missing/misconfigured Docker container causes
// 50+ cryptic timeouts instead of one clear error message.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.trim()) {
  throw new Error(
    'DATABASE_URL is required to run integration tests. Use pnpm test:integration for the per-clone target.',
  );
}

const allowNonLocal = process.env.ALLOW_NON_LOCAL_DATABASE_URL === 'true';

let url: URL;
try {
  url = new URL(databaseUrl);
} catch {
  throw new Error(
    [
      'Invalid DATABASE_URL for integration tests.',
      '',
      'Docs: docs/dev/integration-tests.md',
    ].join('\n'),
  );
}

if (!allowNonLocal && !isLocalDatabaseHost(url.hostname)) {
  throw new Error(
    `Refusing to run integration tests against non-local DATABASE_URL host "${url.hostname}". Set DATABASE_URL to a local Postgres (recommended: Docker) or export ALLOW_NON_LOCAL_DATABASE_URL=true to override.`,
  );
}

const port = url.port || '5432';
const dbName = getDatabaseName(url) ?? 'addiction_boards_test';
const suggestedDatabaseUrl = buildSuggestedLocalDatabaseUrl({
  hostname: url.hostname,
  port,
  dbName,
});
const sql = postgres(databaseUrl, { max: 1, connect_timeout: 3 });

try {
  await sql`SELECT 1`;
} catch (error) {
  const message = [
    `Cannot connect to test database at ${url.hostname}:${port}.`,
    '',
    'Run: pnpm db:test:up',
    '',
    `Then migrate: DATABASE_URL=${suggestedDatabaseUrl} pnpm db:migrate`,
    '',
    'Docs: docs/dev/integration-tests.md',
  ].join('\n');
  throw new Error(message, { cause: error });
} finally {
  try {
    await sql.end({ timeout: 1 });
  } catch {
    // Ignore cleanup errors so they can't mask the real failure.
  }
}
