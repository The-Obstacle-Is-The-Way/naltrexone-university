import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import {
  ApplicationError,
  isRollbackCertainPersistenceError,
  PracticeSessionConflictReasons,
} from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import type { ContainerOverrides } from './container';

vi.mock('server-only', () => ({}));
vi.mock('stripe', () => ({
  default: class StripeMock {},
}));

const ORIGINAL_ENV = snapshotProcessEnv();

process.env.DATABASE_URL ??=
  'postgresql://user:pass@localhost:5432/addiction_boards_test';
process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy';
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= 'pk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_dummy';
process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY ??= 'price_dummy_monthly';
process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL ??= 'price_dummy_annual';
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
process.env.NEXT_PUBLIC_SKIP_CLERK ??= 'true';

async function loadContainer() {
  const mod = await import('./container');
  return mod.createContainer;
}

let createContainer: Awaited<ReturnType<typeof loadContainer>>;
type TestTransaction = (
  fn: (db: DrizzleDb) => Promise<unknown>,
  config?: Parameters<DrizzleDb['transaction']>[1],
) => Promise<unknown>;

beforeAll(async () => {
  createContainer = await loadContainer();
});

afterAll(() => {
  restoreProcessEnv(ORIGINAL_ENV);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function createTransactionOnlyDb(transaction: TestTransaction): DrizzleDb {
  const db = {
    transaction: transaction as DrizzleDb['transaction'],
  } satisfies Pick<DrizzleDb, 'transaction'>;
  return db as DrizzleDb;
}

function createUnexpectedNestedTransactionDb(): DrizzleDb {
  return createTransactionOnlyDb(async () => {
    throw new Error('Unexpected nested transaction in container wiring test');
  });
}

function createPracticeSessionStateWriteContainer(input: {
  transaction: TestTransaction;
  fixture: Pick<
    ReturnType<typeof createPracticeSessionStateWriteFixture>,
    'questions' | 'attempts' | 'sessions'
  >;
  now?: () => Date;
}) {
  return createContainer({
    primitives: {
      db: createTransactionOnlyDb(input.transaction),
      now: input.now ?? (() => new Date('2026-02-01T00:01:00.000Z')),
    },
    repositories: {
      createQuestionRepository: vi.fn(() => input.fixture.questions),
      createAttemptRepository: vi.fn(() => input.fixture.attempts),
      createPracticeSessionRepository: vi.fn(() => input.fixture.sessions),
    },
  } satisfies ContainerOverrides);
}

function createPracticeSessionStateWriteFixture(mode: 'exam' | 'tutor') {
  const userId = 'user-1';
  const sessionId = 'session-1';
  const questionId = 'q1';
  const correctChoiceId = 'c-correct';
  const question = createQuestion({
    id: questionId,
    status: 'published',
    choices: [
      createChoice({
        id: correctChoiceId,
        questionId,
        label: 'A',
        isCorrect: true,
      }),
      createChoice({
        id: 'c-wrong',
        questionId,
        label: 'B',
        isCorrect: false,
      }),
    ],
  });
  const session = createPracticeSession({
    id: sessionId,
    userId,
    mode,
    questionIds: [questionId],
    startedAt: new Date('2026-02-01T00:00:00.000Z'),
    endedAt: null,
  });

  return {
    userId,
    sessionId,
    questionId,
    correctChoiceId,
    questions: new FakeQuestionRepository([question]),
    attempts: new FakeAttemptRepository(),
    sessions: new FakePracticeSessionRepository([session]),
  };
}

class StatementCancelingAttemptRepository extends FakeAttemptRepository {
  constructor(private readonly failure: Error) {
    super();
  }

  override insert(
    ..._args: Parameters<FakeAttemptRepository['insert']>
  ): ReturnType<FakeAttemptRepository['insert']> {
    return Promise.reject(this.failure);
  }
}

describe('container factories — practice session state write transactions', () => {
  it.each([
    '40001',
    '40P01',
  ] as const)('retries the complete discard transaction on %s with a fresh transaction handle', async (code) => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fixture = createPracticeSessionStateWriteFixture('exam');
    const transactionHandles: DrizzleDb[] = [];
    const repositoryHandles: Array<DrizzleDb | undefined> = [];
    const postgresFailure = { code };
    const drizzleFailure = new Error('Failed query', {
      cause: postgresFailure,
    });
    const transaction = vi.fn<TestTransaction>(async (fn) => {
      const tx = createUnexpectedNestedTransactionDb();
      transactionHandles.push(tx);
      const result = await fn(tx);
      if (transactionHandles.length === 1) {
        throw drizzleFailure;
      }
      return result;
    });

    const container = createContainer({
      primitives: {
        db: createTransactionOnlyDb(transaction),
      },
      repositories: {
        createPracticeSessionRepository: (dbOverride) => {
          repositoryHandles.push(dbOverride);
          return fixture.sessions;
        },
      },
    } satisfies ContainerOverrides);
    const result = container.createDiscardPracticeSessionUseCase().execute({
      userId: fixture.userId,
      sessionId: fixture.sessionId,
    });

    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ discarded: true });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transactionHandles).toHaveLength(2);
    expect(transactionHandles[0]).not.toBe(transactionHandles[1]);
    expect(repositoryHandles).toEqual(transactionHandles);
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('maps exhausted discard serialization failures to a typed state-changed CONFLICT', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fixture = createPracticeSessionStateWriteFixture('exam');
    const postgresFailure = { code: '40001' };
    const drizzleFailure = new Error('Failed query', {
      cause: postgresFailure,
    });
    const transaction = vi.fn<TestTransaction>(async () => {
      throw drizzleFailure;
    });

    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture,
    });
    const result = container.createDiscardPracticeSessionUseCase().execute({
      userId: fixture.userId,
      sessionId: fixture.sessionId,
    });
    const rejection = expect(result).rejects.toMatchObject({
      code: 'CONFLICT',
      details: {
        reason: PracticeSessionConflictReasons.StateChangedConcurrently,
      },
      cause: drizzleFailure,
    });

    await vi.runAllTimersAsync();
    await rejection;
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('passes through a non-retryable discard failure without replaying it', async () => {
    const fixture = createPracticeSessionStateWriteFixture('exam');
    const nonRetryableFailure = new Error('connection closed during commit');
    const transaction = vi.fn<TestTransaction>(async () => {
      throw nonRetryableFailure;
    });

    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture,
    });

    await expect(
      container.createDiscardPracticeSessionUseCase().execute({
        userId: fixture.userId,
        sessionId: fixture.sessionId,
      }),
    ).rejects.toBe(nonRetryableFailure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('opens finalize exam write transactions at repeatable read isolation', async () => {
    const fixture = createPracticeSessionStateWriteFixture('exam');
    const tx = createUnexpectedNestedTransactionDb();
    const transaction = vi.fn<TestTransaction>(async (fn) => fn(tx));

    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture,
    });

    await container.createFinalizeExamAnswersUseCase().execute({
      userId: fixture.userId,
      sessionId: fixture.sessionId,
    });

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('retries finalize exam write transactions after retryable serialization failures', async () => {
    const fixture = createPracticeSessionStateWriteFixture('exam');
    const tx = createUnexpectedNestedTransactionDb();
    const serializationFailure = { code: '40001' };
    const transaction = vi.fn<TestTransaction>(async (fn) => {
      if (transaction.mock.calls.length === 1) {
        throw serializationFailure;
      }
      return fn(tx);
    });

    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture,
    });

    await expect(
      container.createFinalizeExamAnswersUseCase().execute({
        userId: fixture.userId,
        sessionId: fixture.sessionId,
      }),
    ).resolves.toMatchObject({ sessionId: fixture.sessionId });

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('waits with jittered backoff before retrying retryable write transaction failures', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fixture = createPracticeSessionStateWriteFixture('exam');
    const tx = createUnexpectedNestedTransactionDb();
    const serializationFailure = { code: '40001' };
    const transaction = vi.fn<TestTransaction>(async (fn) => {
      if (transaction.mock.calls.length === 1) {
        throw serializationFailure;
      }
      return fn(tx);
    });

    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture,
    });

    const result = container.createFinalizeExamAnswersUseCase().execute({
      userId: fixture.userId,
      sessionId: fixture.sessionId,
    });

    await vi.advanceTimersByTimeAsync(24);
    expect(transaction).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toMatchObject({
      sessionId: fixture.sessionId,
    });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('retries finalize exam write transactions when a retryable failure is wrapped in ApplicationError', async () => {
    const fixture = createPracticeSessionStateWriteFixture('exam');
    const tx = createUnexpectedNestedTransactionDb();
    const serializationFailure = { code: '40001' };
    const transaction = vi.fn<TestTransaction>(async (fn) => {
      if (transaction.mock.calls.length === 1) {
        throw new ApplicationError(
          'INTERNAL_ERROR',
          'Failed to insert attempt',
          undefined,
          { cause: serializationFailure },
        );
      }
      return fn(tx);
    });

    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture,
    });

    await expect(
      container.createFinalizeExamAnswersUseCase().execute({
        userId: fixture.userId,
        sessionId: fixture.sessionId,
      }),
    ).resolves.toMatchObject({ sessionId: fixture.sessionId });

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('maps exhausted retryable finalize exam write failures to ApplicationError CONFLICT', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fixture = createPracticeSessionStateWriteFixture('exam');
    const serializationFailure = { code: '40001' };
    const transaction = vi.fn<TestTransaction>(async () => {
      throw serializationFailure;
    });

    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture,
    });

    const result = container.createFinalizeExamAnswersUseCase().execute({
      userId: fixture.userId,
      sessionId: fixture.sessionId,
    });
    const rejection = expect(result).rejects.toMatchObject({
      code: 'CONFLICT',
      cause: serializationFailure,
    });

    await vi.runAllTimersAsync();
    await rejection;
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable ApplicationError failures', async () => {
    const fixture = createPracticeSessionStateWriteFixture('exam');
    const nonRetryableError = new ApplicationError(
      'NOT_FOUND',
      'Practice session not found',
    );
    const transaction = vi.fn<TestTransaction>(async () => {
      throw nonRetryableError;
    });

    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture,
    });

    await expect(
      container.createFinalizeExamAnswersUseCase().execute({
        userId: fixture.userId,
        sessionId: fixture.sessionId,
      }),
    ).rejects.toBe(nonRetryableError);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('opens session-backed submit-answer write transactions at repeatable read isolation', async () => {
    const fixture = createPracticeSessionStateWriteFixture('tutor');
    const tx = createUnexpectedNestedTransactionDb();
    const transaction = vi.fn<TestTransaction>(async (fn) => fn(tx));

    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture,
    });

    await container.createSubmitAnswerUseCase().execute({
      userId: fixture.userId,
      sessionId: fixture.sessionId,
      questionId: fixture.questionId,
      choiceId: fixture.correctChoiceId,
    });

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('retries session-backed submit-answer write transactions after retryable serialization failures', async () => {
    const fixture = createPracticeSessionStateWriteFixture('tutor');
    const tx = createUnexpectedNestedTransactionDb();
    const serializationFailure = { code: '40P01' };
    const transaction = vi.fn<TestTransaction>(async (fn) => {
      if (transaction.mock.calls.length === 1) {
        throw serializationFailure;
      }
      return fn(tx);
    });

    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture,
    });

    await expect(
      container.createSubmitAnswerUseCase().execute({
        userId: fixture.userId,
        sessionId: fixture.sessionId,
        questionId: fixture.questionId,
        choiceId: fixture.correctChoiceId,
      }),
    ).resolves.toMatchObject({
      isCorrect: true,
      correctChoiceId: fixture.correctChoiceId,
    });

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('classifies transaction-body statement cancellation as rollback-certain for session-backed submit', async () => {
    const fixture = createPracticeSessionStateWriteFixture('tutor');
    const statementCancellation = new Error('canceling statement', {
      cause: { code: '57014' },
    });
    const transaction = vi.fn<TestTransaction>(async (fn) =>
      fn(createUnexpectedNestedTransactionDb()),
    );
    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture: {
        ...fixture,
        attempts: new StatementCancelingAttemptRepository(
          statementCancellation,
        ),
      },
    });

    const promise = container.createSubmitAnswerUseCase().execute({
      userId: fixture.userId,
      sessionId: fixture.sessionId,
      questionId: fixture.questionId,
      choiceId: fixture.correctChoiceId,
    });

    await expect(promise).rejects.toSatisfy(isRollbackCertainPersistenceError);
    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: statementCancellation,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('classifies a repository-wrapped statement cancellation as rollback-certain', async () => {
    const fixture = createPracticeSessionStateWriteFixture('tutor');
    // DrizzleAttemptRepository wraps driver errors as
    // ApplicationError('INTERNAL_ERROR', { cause }); the owner must classify
    // through that wrapper, not stop at its non-SQLSTATE code property.
    const wrappedCancellation = new ApplicationError(
      'INTERNAL_ERROR',
      'Failed to insert attempt',
      undefined,
      { cause: { code: '57014' } },
    );
    const transaction = vi.fn<TestTransaction>(async (fn) =>
      fn(createUnexpectedNestedTransactionDb()),
    );
    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture: {
        ...fixture,
        attempts: new StatementCancelingAttemptRepository(wrappedCancellation),
      },
    });

    const promise = container.createSubmitAnswerUseCase().execute({
      userId: fixture.userId,
      sessionId: fixture.sessionId,
      questionId: fixture.questionId,
      choiceId: fixture.correctChoiceId,
    });

    await expect(promise).rejects.toSatisfy(isRollbackCertainPersistenceError);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps transaction-boundary statement cancellation indeterminate for session-backed submit', async () => {
    const fixture = createPracticeSessionStateWriteFixture('tutor');
    const statementCancellation = new Error('commit canceled', {
      cause: { code: '57014' },
    });
    const transaction = vi.fn<TestTransaction>(async (fn) => {
      await fn(createUnexpectedNestedTransactionDb());
      throw statementCancellation;
    });
    const container = createPracticeSessionStateWriteContainer({
      transaction,
      fixture,
    });

    await expect(
      container.createSubmitAnswerUseCase().execute({
        userId: fixture.userId,
        sessionId: fixture.sessionId,
        questionId: fixture.questionId,
        choiceId: fixture.correctChoiceId,
      }),
    ).rejects.toBe(statementCancellation);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
