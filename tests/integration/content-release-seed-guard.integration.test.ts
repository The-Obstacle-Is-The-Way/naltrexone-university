import { randomUUID } from 'node:crypto';
import { eq, inArray, TransactionRollbackError } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  assertNoActiveRelease,
  stageRelease,
} from '@/scripts/content-release/release-activation';
import {
  archivePlaceholderQuestions,
  SYNTHETIC_PLACEHOLDER_SLUGS,
} from '@/scripts/seed/placeholder-archiver';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
} from './helpers';
import { source } from './seed-test-helpers';

// DEBT-483: once a release is active, the direct seed refuses the database,
// and while none is, it still writes. Split from the activation suite, which
// had reached the 800-line limit, with the same fixtures.
type Db = PostgresJsDatabase<typeof schema>;

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

// These cases share the seeded database, so a case that changes status runs
// in a transaction that is always rolled back.
async function withRollback(act: (tx: Db) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await act(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}

async function arrangeQuestion(status: schema.QuestionStatus) {
  return createQuestion(db, cleanup, {
    slug: `it-release-${randomUUID()}`,
    status,
    difficulty: 'easy',
  });
}

async function stateOf(tx: Db, questionIds: string[]) {
  const rows = await tx
    .select({ id: schema.questions.id, status: schema.questions.status })
    .from(schema.questions)
    .where(inArray(schema.questions.id, questionIds));
  return new Map(rows.map((row) => [row.id, row]));
}

function item(question: { id: string; revisionId: string }) {
  return { questionId: question.id, questionRevisionId: question.revisionId };
}

describe('DEBT-483: the direct seed and an active release', () => {
  // Another connection must see the pointer, so these cases commit it. They
  // point it at a release of one test question, never activate it, and always
  // put the pointer back and delete the release.
  async function withActiveRelease(
    act: (releaseId: string) => Promise<void>,
  ): Promise<void> {
    const named = await arrangeQuestion('draft');
    const releaseId = await stageRelease(db, {
      items: [item(named)],
      parentReleaseId: null,
    });
    try {
      await db
        .update(schema.contentReleasePointer)
        .set({ activeReleaseId: releaseId, activatedAt: new Date() });
      await act(releaseId);
    } finally {
      await db
        .update(schema.contentReleasePointer)
        .set({ activeReleaseId: null, activatedAt: null });
      await db
        .delete(schema.contentReleases)
        .where(eq(schema.contentReleases.id, releaseId));
    }
  }

  it('refuses to sync an existing question', async () => {
    const question = await arrangeQuestion('published');

    await withActiveRelease(async (releaseId) => {
      await expect(
        syncQuestionsFromFiles(db, [
          source(question.slug, { stem: 'A rewritten clinical task.' }),
        ]),
      ).rejects.toThrow(new RegExp(`release ${releaseId} is active`));
    });

    expect(
      await db
        .select({ id: schema.questionRevisions.id })
        .from(schema.questionRevisions)
        .where(eq(schema.questionRevisions.questionId, question.id)),
    ).toHaveLength(1);
  });

  it('refuses to insert a new question', async () => {
    const slug = `it-release-${randomUUID()}`;
    const inserted = () =>
      db
        .select({ id: schema.questions.id })
        .from(schema.questions)
        .where(eq(schema.questions.slug, slug));

    try {
      await withActiveRelease(async () => {
        await expect(
          syncQuestionsFromFiles(db, [source(slug)]),
        ).rejects.toThrow(/is active/);
      });

      expect(await inserted()).toEqual([]);
    } finally {
      // Without the guard the seed would have inserted it.
      cleanup.questionIds.push(...(await inserted()).map((row) => row.id));
    }
  });

  it('refuses to archive placeholders', async () => {
    const placeholders = await db
      .select({ id: schema.questions.id, status: schema.questions.status })
      .from(schema.questions)
      .where(inArray(schema.questions.slug, [...SYNTHETIC_PLACEHOLDER_SLUGS]));

    try {
      await withActiveRelease(async () => {
        await expect(archivePlaceholderQuestions(db)).rejects.toThrow(
          /is active/,
        );
      });
    } finally {
      // Without the guard the archiver would have archived the fixtures.
      for (const { id, status } of placeholders) {
        await db
          .update(schema.questions)
          .set({ status })
          .where(eq(schema.questions.id, id));
      }
    }
  });

  it('archives committed fixtures but preserves an authored prefix match while no release is active', async () => {
    const placeholder = await createQuestion(db, cleanup, {
      slug: `placeholder-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    await withRollback(async (tx) => {
      await tx
        .update(schema.questions)
        .set({ status: 'published' })
        .where(
          inArray(schema.questions.slug, [...SYNTHETIC_PLACEHOLDER_SLUGS]),
        );

      const archived = await archivePlaceholderQuestions(tx);

      const placeholders = await tx
        .select({ status: schema.questions.status })
        .from(schema.questions)
        .where(
          inArray(schema.questions.slug, [...SYNTHETIC_PLACEHOLDER_SLUGS]),
        );
      // The integration database is seeded with the committed fixtures
      // (SEED_INCLUDE_PLACEHOLDERS=true in CI and the local orchestrator), so
      // all ten exist; without them this case would prove nothing.
      expect(placeholders).toHaveLength(SYNTHETIC_PLACEHOLDER_SLUGS.length);
      expect(archived).toBe(SYNTHETIC_PLACEHOLDER_SLUGS.length);
      expect(placeholders.every((row) => row.status === 'archived')).toBe(true);
      expect(
        (await stateOf(tx, [placeholder.id])).get(placeholder.id)?.status,
      ).toBe('published');
    });
  });

  it('waits for an activation in progress, then refuses', async () => {
    const question = await arrangeQuestion('published');
    const named = await arrangeQuestion('draft');
    const releaseId = await stageRelease(db, {
      items: [item(named)],
      parentReleaseId: null,
    });
    const { sql: activationSql } = createIntegrationDb();
    const { sql: monitorSql } = createIntegrationDb();
    const locked = Promise.withResolvers<number>();
    const release = Promise.withResolvers<void>();
    // Holds the pointer the way activation does, then commits it.
    const activation = activationSql.begin(async (tx) => {
      const [backend] = await tx<{ pid: number }[]>`
        SELECT pg_backend_pid()::int AS pid
      `;
      await tx`SELECT active_release_id FROM content_release_pointer FOR UPDATE`;
      await tx`UPDATE content_release_pointer SET active_release_id = ${releaseId}, activated_at = now()`;
      locked.resolve(backend?.pid ?? 0);
      await release.promise;
    });
    try {
      const pid = await locked.promise;
      const seed = syncQuestionsFromFiles(db, [
        source(question.slug, { stem: 'A rewritten clinical task.' }),
      ]);
      await expect
        .poll(async () => {
          const [row] = await monitorSql<{ blocked: boolean }[]>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE ${pid} = ANY(pg_blocking_pids(pid))
            ) AS blocked
          `;
          return row?.blocked;
        })
        .toBe(true);
      release.resolve();
      await activation;

      await expect(seed).rejects.toThrow(/is active/);
    } finally {
      release.resolve();
      await Promise.allSettled([activation]);
      await db
        .update(schema.contentReleasePointer)
        .set({ activeReleaseId: null, activatedAt: null });
      await db
        .delete(schema.contentReleases)
        .where(eq(schema.contentReleases.id, releaseId));
      await Promise.allSettled([
        closeConnection(activationSql),
        closeConnection(monitorSql),
      ]);
    }
  });

  it('refuses when the pointer row is missing', async () => {
    await withRollback(async (tx) => {
      await tx.delete(schema.contentReleasePointer);

      await expect(assertNoActiveRelease(tx)).rejects.toThrow(
        /release pointer is missing/,
      );
    });
  });
});
