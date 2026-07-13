import { describe, expect, it, vi } from 'vitest';
import { isRollbackCertainPersistenceError } from '@/src/application/errors';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';

const sessionId = crypto.randomUUID();
const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();

type RepoDb = ConstructorParameters<typeof DrizzlePracticeSessionRepository>[0];
type TransactionBody = (tx: { select: () => never }) => Promise<unknown>;
type TestTransaction = (body: TransactionBody) => Promise<unknown>;

function createRepository(transaction: TestTransaction) {
  // Drizzle is the external adapter boundary; this fake intentionally exposes
  // only the transaction surface exercised by statement-cancellation tests.
  const db = {
    transaction,
  } as unknown as RepoDb;
  return new DrizzlePracticeSessionRepository(db);
}

function markQuestion(repo: DrizzlePracticeSessionRepository) {
  return repo.setQuestionMarkedForReview({
    sessionId,
    userId,
    questionId,
    markedForReview: true,
  });
}

describe('DrizzlePracticeSessionRepository statement cancellation', () => {
  it('classifies transaction-body cancellation as rollback-certain for a mark write', async () => {
    const statementCancellation = new Error('canceling statement', {
      cause: { code: '57014' },
    });
    const transaction = vi.fn<TestTransaction>(async (body) =>
      body({
        select: () => {
          throw statementCancellation;
        },
      }),
    );
    const repo = createRepository(transaction);

    const promise = markQuestion(repo);

    await expect(promise).rejects.toSatisfy(isRollbackCertainPersistenceError);
    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: statementCancellation,
    });
  });

  it('keeps transaction-boundary cancellation indeterminate for a mark write', async () => {
    const statementCancellation = new Error('commit canceled', {
      cause: { code: '57014' },
    });
    const transaction = vi.fn<TestTransaction>(async () => {
      throw statementCancellation;
    });
    const repo = createRepository(transaction);

    await expect(markQuestion(repo)).rejects.toBe(statementCancellation);
  });
});
