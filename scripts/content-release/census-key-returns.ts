import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '../../db/schema';
import { canonicalMarkdownSql } from '../../src/adapters/repositories/shared/canonical-markdown-sql';
import { runHumanDatabaseCommand } from '../database/database-command';
import { isMain } from '../lib/entry-point.mts';
import { withCommandDatabase } from './command-support';

type KeyReturnCensus = {
  candidateRevisions: number;
  questions: number;
  publishedCurrentCandidates: number;
  attemptsBound: number;
  answeredAttemptsBound: number;
  malformedKeyRevisions: number;
};

/**
 * BUG-351's owner check: revisions whose answer key changed from the one
 * before and matches an earlier revision's, in revision order. The key is
 * ADR-022's: each correct choice's exact label and normalized text, as every
 * score and release comparison reads it. Counts only: no content,
 * identifiers or stored hashes leave this query.
 */
export async function readKeyReturnCensus(
  db: PostgresJsDatabase<typeof schema>,
): Promise<KeyReturnCensus> {
  const text = canonicalMarkdownSql(sql`c.text_md`);
  return db.transaction(
    async (tx) => {
      const rows = await tx.execute<KeyReturnCensus>(sql`
      with keyed as (
        select r.id, r.question_id, r.revision_number,
          count(c.id) filter (where c.is_correct) as key_choices,
          coalesce(jsonb_agg(jsonb_build_array(c.label, ${text})
            order by c.label, ${text}) filter (where c.is_correct), '[]'::jsonb) as answer_key
        from question_revisions r
        left join choices c on c.question_revision_id = r.id
        group by r.id, r.question_id, r.revision_number
      ), stepped as (
        select *,
          lag(answer_key) over (partition by question_id order by revision_number) as previous_key,
          lag(key_choices) over (partition by question_id order by revision_number) as previous_key_choices
        from keyed
      ), candidates as (
        select s.id, s.question_id from stepped s
        where s.key_choices = 1 and s.previous_key_choices = 1
          and s.previous_key <> s.answer_key
          and exists (
            select 1 from keyed k
            where k.question_id = s.question_id
              and k.revision_number < s.revision_number
              and k.key_choices = 1 and k.answer_key = s.answer_key
          )
      )
      select
        (select count(*)::int from candidates) as "candidateRevisions",
        (select count(distinct question_id)::int from candidates) as "questions",
        (select count(*)::int from candidates c join questions q on q.current_revision_id = c.id
          where q.status = 'published') as "publishedCurrentCandidates",
        (select count(*)::int from attempts a
          where a.question_revision_id in (select id from candidates)) as "attemptsBound",
        (select count(*)::int from attempts a where a.selected_choice_id is not null
          and a.question_revision_id in (select id from candidates)) as "answeredAttemptsBound",
        (select count(*)::int from keyed where key_choices <> 1) as "malformedKeyRevisions"
    `);
      const result = rows[0];
      if (!result) throw new Error('Key-return census returned no counts');
      return result;
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

export async function runKeyReturnCensus(
  argv: readonly string[] = process.argv.slice(2),
  {
    env = process.env,
    log = console.info,
  }: {
    env?: Readonly<Record<string, string | undefined>>;
    log?: (line: string) => void;
  } = {},
): Promise<void> {
  if (argv.length > 0) throw new Error('This census takes no arguments');
  await runHumanDatabaseCommand({
    env,
    log,
    execute: (databaseUrl) =>
      withCommandDatabase(databaseUrl, async (db) => {
        log(JSON.stringify(await readKeyReturnCensus(db)));
      }),
  });
}

/* v8 ignore start */
if (isMain(import.meta.url)) {
  runKeyReturnCensus().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
