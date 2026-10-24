import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import { canonicalizeMarkdown } from '../../lib/content/parse-mdx-question';
import {
  answerKeyChanged,
  type KeyChoice,
} from '../../src/domain/services/answer-key';
import { runHumanDatabaseCommand } from '../database/database-command';
import { isMain } from '../lib/entry-point.mts';
import { parseSeedQuestionFile } from '../seed/question-parser';
import { withCommandDatabase } from './command-support';
import { readContentCommit } from './content-source';
import { CORPUS_COMMIT_PATTERN } from './release-manifest';

type LiveKeyComparison = {
  commit: string;
  liveQuestions: number;
  commitQuestions: number;
  missingFromCommit: number;
  notLive: number;
  differingKeys: number;
};

// The release planner's key: each correct choice's label and normalized text.
function keyChoices(
  choices: readonly { label: string; textMd: string; isCorrect: boolean }[],
): KeyChoice[] {
  return choices.map((choice) => ({
    label: choice.label,
    textMd: canonicalizeMarkdown(choice.textMd),
    isCorrect: choice.isCorrect,
  }));
}

/**
 * BUG-351's owner check before the bootstrap: production's published current
 * answer keys against one commit of the content repository's main, read as
 * the first release after the bootstrap will read it. Counts only, plus the
 * commit, whose full ID becomes that release's --baseline.
 */
export async function compareLiveKeys(
  db: PostgresJsDatabase<typeof schema>,
  source: { repository: string; commit: string },
): Promise<LiveKeyComparison> {
  const files = await readContentCommit(source);
  const committed = new Map(
    files.map(({ raw, absolutePath }) => {
      const question = parseSeedQuestionFile(raw, absolutePath);
      return [
        question.slug,
        keyChoices(
          question.choices.map((choice) => ({
            label: choice.label,
            textMd: choice.text_md,
            isCorrect: choice.is_correct,
          })),
        ),
      ] as const;
    }),
  );
  const rows = await db.transaction(
    (tx) =>
      tx
        .select({
          slug: schema.questions.slug,
          label: schema.choices.label,
          textMd: schema.choices.textMd,
          isCorrect: schema.choices.isCorrect,
        })
        .from(schema.questions)
        .leftJoin(
          schema.choices,
          eq(
            schema.choices.questionRevisionId,
            schema.questions.currentRevisionId,
          ),
        )
        .where(eq(schema.questions.status, 'published')),
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  const live = new Map<string, KeyChoice[]>();
  for (const row of rows) {
    const key = live.get(row.slug) ?? [];
    if (row.label !== null && row.textMd !== null && row.isCorrect !== null)
      key.push(
        ...keyChoices([
          { label: row.label, textMd: row.textMd, isCorrect: row.isCorrect },
        ]),
      );
    live.set(row.slug, key);
  }
  let missingFromCommit = 0;
  let differingKeys = 0;
  for (const [slug, key] of live) {
    const committedKey = committed.get(slug);
    if (committedKey === undefined) missingFromCommit += 1;
    else if (answerKeyChanged(key, committedKey)) differingKeys += 1;
  }
  return {
    commit: source.commit,
    liveQuestions: live.size,
    commitQuestions: committed.size,
    missingFromCommit,
    notLive: [...committed.keys()].filter((slug) => !live.has(slug)).length,
    differingKeys,
  };
}

export function parseCompareArgs(argv: readonly string[]): {
  repository: string;
  commit: string;
} {
  let repository: string | undefined;
  let commit: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo' && repository === undefined) {
      repository = argv[++index];
      if (!repository || repository.startsWith('--'))
        throw new Error('--repo needs a repository path');
    } else if (arg === '--commit' && commit === undefined) {
      commit = argv[++index];
      if (!commit || !CORPUS_COMMIT_PATTERN.test(commit))
        throw new Error('--commit needs a full lowercase commit ID');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!repository || !commit)
    throw new Error('--repo and --commit are required');
  return { repository, commit };
}

export async function runCompareLiveKeys(
  argv: readonly string[] = process.argv.slice(2),
  {
    env = process.env,
    log = console.info,
  }: {
    env?: Readonly<Record<string, string | undefined>>;
    log?: (line: string) => void;
  } = {},
): Promise<void> {
  const source = parseCompareArgs(argv);
  await runHumanDatabaseCommand({
    env,
    log,
    execute: (databaseUrl) =>
      withCommandDatabase(databaseUrl, async (db) => {
        log(JSON.stringify(await compareLiveKeys(db, source)));
      }),
  });
}

/* v8 ignore start */
if (isMain(import.meta.url)) {
  runCompareLiveKeys().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
