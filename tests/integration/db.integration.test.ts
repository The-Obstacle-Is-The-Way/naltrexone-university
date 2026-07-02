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
      'practice_session_question_states',
      'attempts',
      'bookmarks',
      'question_feedback',
    ] as const;

    for (const table of expectedTables) {
      expect(tables).toContain(table);
    }
  });

  it('creates question feedback foreign-key support indexes', async () => {
    const rows = await sql<{ indexname: string }[]>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'question_feedback'
    `;
    const indexes = new Set(rows.map((row) => row.indexname));

    expect(indexes).toContain('question_feedback_user_created_at_idx');
    expect(indexes).toContain('question_feedback_attempt_created_at_idx');
    expect(indexes).toContain(
      'question_feedback_practice_session_created_at_idx',
    );
  });

  it('creates practice-session question-state foreign-key support indexes', async () => {
    const rows = await sql<{ indexname: string }[]>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'practice_session_question_states'
    `;
    const indexes = new Set(rows.map((row) => row.indexname));

    expect(indexes).toContain(
      'practice_session_question_states_question_id_idx',
    );
    expect(indexes).toContain(
      'practice_session_question_states_latest_choice_question_idx',
    );
    expect(indexes).toContain(
      'practice_session_question_states_draft_choice_question_idx',
    );
  });

  it('allows attempts.selected_choice_id to be nullable for omitted attempts', async () => {
    const rows = await sql<{ is_nullable: string }[]>`
      select is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'attempts'
        and column_name = 'selected_choice_id'
    `;
    expect(rows[0]?.is_nullable).toBe('YES');
  });

  it('creates omitted-attempt CHECK constraints', async () => {
    const rows = await sql<{ conname: string; def: string }[]>`
      select c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      join pg_class t on c.conrelid = t.oid
      where t.relname = 'attempts'
        and c.conname in (
          'attempts_selected_choice_or_omitted_chk',
          'attempts_omitted_incorrect_chk'
        )
    `;

    const byName = new Map(rows.map((row) => [row.conname, row.def]));
    expect(byName.get('attempts_selected_choice_or_omitted_chk')).toContain(
      '(selected_choice_id IS NOT NULL) <> is_omitted',
    );
    expect(byName.get('attempts_omitted_incorrect_chk')).toContain(
      '(NOT is_omitted) OR (is_correct = false)',
    );
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
