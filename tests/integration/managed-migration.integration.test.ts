import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import postgres from 'postgres';
import { afterEach, describe, expect, it } from 'vitest';
import journal from '@/db/migrations/meta/_journal.json';
import { withRecordedCli } from '../shared/recorded-cli';
import { createDisposableDatabase } from './disposable-database-test-helpers';

const exec = promisify(execFile);
const disposables: Array<Awaited<ReturnType<typeof createDisposableDatabase>>> =
  [];
afterEach(async () => {
  for (const database of disposables.splice(0)) await database.drop();
});
async function database(migrationsFolder?: string) {
  const value = await createDisposableDatabase(
    migrationsFolder ? { migrationsFolder } : {},
  );
  disposables.push(value);
  return value;
}
async function migrate(databaseUrl: string) {
  try {
    await exec(
      process.execPath,
      ['--import', 'tsx', 'scripts/database/managed/run-managed-db-migrate.ts'],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        timeout: 8_000,
      },
    );
    return 0;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 1
    )
      return 1;
    throw error;
  }
}
async function ledger(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    return await sql`select created_at, hash from drizzle.__drizzle_migrations order by created_at`;
  } finally {
    await sql.end();
  }
}
const first = journal.entries[0];
if (!first) throw new Error('Migration journal must not be empty');
const last = journal.entries.at(-1);
if (last?.tag !== '0052_bug345_role_timeouts')
  throw new Error(
    'Partial fixture must replay only the idempotent final migration',
  );

describe('managed migration ledger boundary against PostgreSQL', () => {
  it('accepts a fresh database with no ledger and applies the full journal', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'nu-empty-migrations-'));
    mkdirSync(join(folder, 'meta'));
    writeFileSync(
      join(folder, 'meta/_journal.json'),
      JSON.stringify({ version: '7', dialect: 'postgresql', entries: [] }),
    );
    let fixture: Awaited<ReturnType<typeof database>>;
    try {
      fixture = await database(folder);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
    const sql = postgres(fixture.url, { max: 1 });
    try {
      await sql`drop schema drizzle cascade`;
    } finally {
      await sql.end();
    }
    expect(await migrate(fixture.url)).toBe(0);
    expect(await ledger(fixture.url)).toHaveLength(journal.entries.length);
  });

  it('accepts a valid partial ledger and applies its pending migration', async () => {
    const fixture = await database();
    const sql = postgres(fixture.url, { max: 1 });
    try {
      await sql`delete from drizzle.__drizzle_migrations where created_at = ${last.when}`;
    } finally {
      await sql.end();
    }
    expect(await migrate(fixture.url)).toBe(0);
    expect(await ledger(fixture.url)).toHaveLength(journal.entries.length);
  });

  it('leaves a current valid ledger unchanged', async () => {
    const fixture = await database();
    const before = await ledger(fixture.url);
    expect(await migrate(fixture.url)).toBe(0);
    expect(await ledger(fixture.url)).toEqual(before);
  });

  it('refuses a successful migrator process that leaves pending entries unapplied', async () => {
    const fixture = await database();
    const sql = postgres(fixture.url, { max: 1 });
    try {
      await sql`delete from drizzle.__drizzle_migrations where created_at = ${last.when}`;
    } finally {
      await sql.end();
    }
    await withRecordedCli('pnpm', '', async (calls) => {
      expect(await migrate(fixture.url)).toBe(1);
      expect(calls()).toEqual([['exec', 'drizzle-kit', 'migrate']]);
    });
    expect(await ledger(fixture.url)).toHaveLength(journal.entries.length - 1);
  });

  it('refuses changed hashes before applying a pending migration', async () => {
    const fixture = await database();
    const sql = postgres(fixture.url, { max: 1 });
    try {
      await sql`delete from drizzle.__drizzle_migrations where created_at = ${last.when}`;
      await sql`update drizzle.__drizzle_migrations set hash = ${'0'.repeat(64)} where created_at = ${first.when}`;
    } finally {
      await sql.end();
    }
    const before = await ledger(fixture.url);
    expect(await migrate(fixture.url)).toBe(1);
    expect(await ledger(fixture.url)).toEqual(before);
  });

  it('refuses a ledger entry absent from the journal', async () => {
    const fixture = await database();
    const sql = postgres(fixture.url, { max: 1 });
    try {
      await sql`insert into drizzle.__drizzle_migrations (created_at, hash) values (1999999999999, ${'0'.repeat(64)})`;
    } finally {
      await sql.end();
    }
    const before = await ledger(fixture.url);
    expect(await migrate(fixture.url)).toBe(1);
    expect(await ledger(fixture.url)).toEqual(before);
  });
});
