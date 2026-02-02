import 'dotenv/config';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to run integration tests. Did you forget to set it?',
  );
}

const allowNonLocal = process.env.ALLOW_NON_LOCAL_DATABASE_URL === 'true';
const host = new URL(databaseUrl).hostname;
if (!allowNonLocal && host !== 'localhost' && host !== '127.0.0.1') {
  throw new Error(
    `Refusing to run integration tests against non-local DATABASE_URL host "${host}". Set DATABASE_URL to a local Postgres (recommended: Docker) or export ALLOW_NON_LOCAL_DATABASE_URL=true to override.`,
  );
}

const sql = postgres(databaseUrl, { max: 1 });

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe('database migrations', () => {
  it('enables pgcrypto (gen_random_uuid)', async () => {
    const rows = await sql<{ extname: string }[]>`
      select extname from pg_extension where extname = 'pgcrypto'
    `;
    expect(rows).toHaveLength(1);
  });

  it('creates required tables', async () => {
    const rows = await sql<{ tablename: string }[]>`
      select tablename
      from pg_tables
      where schemaname = 'public'
    `;
    const tables = new Set(rows.map((r) => r.tablename));

    const expectedTables = [
      'users',
      'stripe_customers',
      'stripe_subscriptions',
      'stripe_events',
      'rate_limits',
      'idempotency_keys',
      'questions',
      'choices',
      'tags',
      'question_tags',
      'practice_sessions',
      'attempts',
      'bookmarks',
    ] as const;

    for (const table of expectedTables) {
      expect(tables).toContain(table);
    }
  });

  it('requires attempts.selected_choice_id (NOT NULL)', async () => {
    const rows = await sql<{ is_nullable: string }[]>`
      select is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'attempts'
        and column_name = 'selected_choice_id'
    `;
    expect(rows[0]?.is_nullable).toBe('NO');
  });

  it('restricts deleting choices referenced by attempts', async () => {
    const rows = await sql<{ def: string }[]>`
      select pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      join pg_class t on c.conrelid = t.oid
      where t.relname = 'attempts'
        and c.conname = 'attempts_selected_choice_id_choices_id_fk'
    `;

    expect(rows[0]?.def).toContain('ON DELETE RESTRICT');
  });
});
