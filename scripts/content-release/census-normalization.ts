import { pathToFileURL } from 'node:url';
import { type SQL, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '../../db/schema';
import { canonicalMarkdownSql } from '../../src/adapters/repositories/shared/canonical-markdown-sql';
import { runHumanDatabaseCommand } from '../database-command';
import { withCommandDatabase } from './command-support';

type NormalizationCensus = {
  revisions: number;
  choices: number;
  noncanonicalRevisions: number;
  stems: number;
  explanations: number;
  references: number;
  choiceTexts: number;
  choiceExplanations: number;
  correctChoiceTexts: number;
  revisionsWithCorrectChoiceTextChanges: number;
};

// The seed maps a raw empty optional field to null before normalization.
// A whitespace-only nonempty value instead normalizes to an empty string.
function optionalMarkdownSql(field: SQL): SQL {
  return sql`case when ${field} = '' then null else ${canonicalMarkdownSql(field)} end`;
}

/** Counts only: no content, identifiers or stored hashes leave this query. */
export async function readNormalizationCensus(
  db: PostgresJsDatabase<typeof schema>,
): Promise<NormalizationCensus> {
  return db.transaction(
    async (tx) => {
      const rows = await tx.execute<NormalizationCensus>(sql`
      with revision_fields as (
        select r.id,
          r.stem_md is distinct from ${canonicalMarkdownSql(sql`r.stem_md`)} as stem,
          r.explanation_md is distinct from ${canonicalMarkdownSql(sql`r.explanation_md`)} as explanation,
          r.reference_md is distinct from ${optionalMarkdownSql(sql`r.reference_md`)} as reference
        from question_revisions r
      ), choice_fields as (
        select c.question_revision_id, c.is_correct,
          c.text_md is distinct from ${canonicalMarkdownSql(sql`c.text_md`)} as text,
          c.explanation_md is distinct from ${optionalMarkdownSql(sql`c.explanation_md`)} as explanation
        from choices c
      )
      select
        (select count(*)::int from revision_fields) as revisions,
        (select count(*)::int from choice_fields) as choices,
        (select count(*)::int from revision_fields r where r.stem or r.explanation or r.reference or exists (
          select 1 from choice_fields c where c.question_revision_id = r.id and (c.text or c.explanation)
        )) as "noncanonicalRevisions",
        (select count(*)::int from revision_fields where stem) as stems,
        (select count(*)::int from revision_fields where explanation) as explanations,
        (select count(*)::int from revision_fields where reference) as "references",
        (select count(*)::int from choice_fields where text) as "choiceTexts",
        (select count(*)::int from choice_fields where explanation) as "choiceExplanations",
        (select count(*)::int from choice_fields where is_correct and text) as "correctChoiceTexts",
        (select count(distinct question_revision_id)::int from choice_fields where is_correct and text) as "revisionsWithCorrectChoiceTextChanges"
    `);
      const result = rows[0];
      if (!result) throw new Error('Normalization census returned no counts');
      return result;
    },
    { accessMode: 'read only' },
  );
}

export async function runNormalizationCensus(
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
        log(JSON.stringify(await readNormalizationCensus(db)));
      }),
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
/* v8 ignore start */
if (import.meta.url === executedPath) {
  runNormalizationCensus().catch(() => {
    console.error('Normalization census failed; no content was changed.');
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
