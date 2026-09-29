import { setTimeout as sleep } from 'node:timers/promises';
import type * as schema from '@/db/schema';
import type { QuestionDifficulty } from '@/src/domain/value-objects';
import type { IntegrationSql } from './helpers';

// A seed source file for integration tests, with optional content edits.
export type ContentEdits = {
  difficulty?: QuestionDifficulty;
  stem?: string;
  explanation?: string;
  reference?: string;
  correctText?: string;
  wrongText?: string;
  wrongExplanation?: string;
  labels?: readonly string[];
  correctLabel?: string;
  status?: schema.QuestionStatus;
};

export function source(slug: string, edits: ContentEdits = {}) {
  const choices = (edits.labels ?? ['A', 'B', 'C']).flatMap((label) => {
    const correct = label === (edits.correctLabel ?? 'B');
    const text =
      label === 'B'
        ? (edits.correctText ?? 'Original correct option.')
        : (edits.wrongText ?? `Original option ${label}.`);
    return [
      `  - label: ${label}`,
      `    text: ${JSON.stringify(text)}`,
      `    correct: ${correct}`,
      ...(correct
        ? []
        : [
            `    explanation: ${JSON.stringify(edits.wrongExplanation ?? 'Original wrong-option explanation.')}`,
          ]),
    ];
  });
  return {
    absolutePath: `/tmp/${slug}.mdx`,
    raw: [
      '---',
      `slug: ${slug}`,
      `difficulty: ${edits.difficulty ?? 'easy'}`,
      `status: ${edits.status ?? 'published'}`,
      'tags:',
      '  - {slug: general, name: General, kind: topic}',
      '  - {slug: alcohol, name: Alcohol, kind: substance}',
      'choices:',
      ...choices,
      '---',
      '## Stem',
      edits.stem ?? 'Original clinical task.',
      '## Explanation',
      edits.explanation ?? 'Original general explanation.',
      '### Reference',
      edits.reference ?? 'Original synthetic reference.',
    ].join('\n'),
  };
}

const LOCK_WAIT_TIMEOUT_MS = 5_000;

// Resolves once another backend waits on a `questions` row lock held by
// `blockerPid`; rejects after five seconds.
export async function waitForBlockedQuestionLock(input: {
  monitorSql: IntegrationSql;
  blockerPid: number;
}): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const rows = await input.monitorSql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE wait_event_type = 'Lock'
        AND query ILIKE '%"questions"%'
        AND ${input.blockerPid} = ANY(pg_blocking_pids(pid))
    `;
    if ((rows.at(0)?.count ?? 0) > 0) {
      return;
    }
    await sleep(25);
  }

  throw new Error(
    'Timed out waiting for a query to block on the question row lock',
  );
}
