import 'dotenv/config';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to run integration tests. Did you forget to set it?',
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
});
