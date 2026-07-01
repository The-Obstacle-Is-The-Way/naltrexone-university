import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import {
  FakeAttemptRepository,
  FakeLogger,
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

beforeAll(async () => {
  createContainer = await loadContainer();
});

afterAll(() => {
  restoreProcessEnv(ORIGINAL_ENV);
});

describe('container factories — practice session state write transactions', () => {
  it('opens finalize exam write transactions at repeatable read isolation', async () => {
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
      mode: 'exam',
      questionIds: [questionId],
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    });
    const questions = new FakeQuestionRepository([question]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([session]);
    const tx = { tx: true } as const;
    const transaction = vi.fn(
      async <T>(fn: (db: unknown) => Promise<T>): Promise<T> => fn(tx),
    );

    const container = createContainer({
      primitives: {
        db: { transaction } as unknown as DrizzleDb,
        env: {
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
          NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
          STRIPE_WEBHOOK_SECRET: 'whsec',
          NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        } as unknown as typeof import('./env').env,
        logger: new FakeLogger() as unknown as typeof import('./logger').logger,
        getStripe: () =>
          ({}) as unknown as ReturnType<typeof import('./stripe').getStripe>,
        now: () => new Date('2026-02-01T00:01:00.000Z'),
      },
      repositories: {
        createQuestionRepository: vi.fn(() => questions),
        createAttemptRepository: vi.fn(() => attempts),
        createPracticeSessionRepository: vi.fn(() => sessions),
      },
    });

    await container.createFinalizeExamAnswersUseCase().execute({
      userId,
      sessionId,
    });

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('retries finalize exam write transactions after retryable serialization failures', async () => {
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
      mode: 'exam',
      questionIds: [questionId],
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    });
    const questions = new FakeQuestionRepository([question]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([session]);
    const tx = { tx: true } as const;
    const serializationFailure = { code: '40001' };
    const transaction = vi.fn(
      async <T>(fn: (db: unknown) => Promise<T>): Promise<T> => {
        if (transaction.mock.calls.length === 1) {
          throw serializationFailure;
        }
        return fn(tx);
      },
    );

    const container = createContainer({
      primitives: {
        db: { transaction } as unknown as DrizzleDb,
        env: {
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
          NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
          STRIPE_WEBHOOK_SECRET: 'whsec',
          NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        } as unknown as typeof import('./env').env,
        logger: new FakeLogger() as unknown as typeof import('./logger').logger,
        getStripe: () =>
          ({}) as unknown as ReturnType<typeof import('./stripe').getStripe>,
        now: () => new Date('2026-02-01T00:01:00.000Z'),
      },
      repositories: {
        createQuestionRepository: vi.fn(() => questions),
        createAttemptRepository: vi.fn(() => attempts),
        createPracticeSessionRepository: vi.fn(() => sessions),
      },
    });

    await expect(
      container.createFinalizeExamAnswersUseCase().execute({
        userId,
        sessionId,
      }),
    ).resolves.toMatchObject({ sessionId });

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('maps exhausted retryable finalize exam write failures to ApplicationError CONFLICT', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';
    const question = createQuestion({ id: questionId, status: 'published' });
    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      questionIds: [questionId],
      endedAt: null,
    });
    const questions = new FakeQuestionRepository([question]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([session]);
    const serializationFailure = { code: '40001' };
    const transaction = vi.fn(async () => {
      throw serializationFailure;
    });

    const container = createContainer({
      primitives: {
        db: { transaction } as unknown as DrizzleDb,
        env: {
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
          NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
          STRIPE_WEBHOOK_SECRET: 'whsec',
          NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        } as unknown as typeof import('./env').env,
        logger: new FakeLogger() as unknown as typeof import('./logger').logger,
        getStripe: () =>
          ({}) as unknown as ReturnType<typeof import('./stripe').getStripe>,
        now: () => new Date('2026-02-01T00:01:00.000Z'),
      },
      repositories: {
        createQuestionRepository: vi.fn(() => questions),
        createAttemptRepository: vi.fn(() => attempts),
        createPracticeSessionRepository: vi.fn(() => sessions),
      },
    });

    await expect(
      container.createFinalizeExamAnswersUseCase().execute({
        userId,
        sessionId,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      cause: serializationFailure,
    });

    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('opens session-backed submit-answer write transactions at repeatable read isolation', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';
    const selectedChoiceId = 'c-correct';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({
          id: 'c-wrong',
          questionId,
          label: 'A',
          isCorrect: false,
        }),
        createChoice({
          id: selectedChoiceId,
          questionId,
          label: 'B',
          isCorrect: true,
        }),
      ],
    });
    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      questionIds: [questionId],
      endedAt: null,
    });
    const questions = new FakeQuestionRepository([question]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([session]);
    const tx = { tx: true } as const;
    const transaction = vi.fn(
      async <T>(fn: (db: unknown) => Promise<T>): Promise<T> => fn(tx),
    );

    const container = createContainer({
      primitives: {
        db: { transaction } as unknown as DrizzleDb,
        env: {
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
          NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
          STRIPE_WEBHOOK_SECRET: 'whsec',
          NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        } as unknown as typeof import('./env').env,
        logger: new FakeLogger() as unknown as typeof import('./logger').logger,
        getStripe: () =>
          ({}) as unknown as ReturnType<typeof import('./stripe').getStripe>,
        now: () => new Date('2026-02-01T00:01:00.000Z'),
      },
      repositories: {
        createQuestionRepository: vi.fn(() => questions),
        createAttemptRepository: vi.fn(() => attempts),
        createPracticeSessionRepository: vi.fn(() => sessions),
      },
    });

    await container.createSubmitAnswerUseCase().execute({
      userId,
      sessionId,
      questionId,
      choiceId: selectedChoiceId,
    });

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('retries session-backed submit-answer write transactions after retryable serialization failures', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';
    const selectedChoiceId = 'c-correct';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({
          id: 'c-wrong',
          questionId,
          label: 'A',
          isCorrect: false,
        }),
        createChoice({
          id: selectedChoiceId,
          questionId,
          label: 'B',
          isCorrect: true,
        }),
      ],
    });
    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      questionIds: [questionId],
      endedAt: null,
    });
    const questions = new FakeQuestionRepository([question]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([session]);
    const tx = { tx: true } as const;
    const serializationFailure = { code: '40P01' };
    const transaction = vi.fn(
      async <T>(fn: (db: unknown) => Promise<T>): Promise<T> => {
        if (transaction.mock.calls.length === 1) {
          throw serializationFailure;
        }
        return fn(tx);
      },
    );

    const container = createContainer({
      primitives: {
        db: { transaction } as unknown as DrizzleDb,
        env: {
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
          NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
          STRIPE_WEBHOOK_SECRET: 'whsec',
          NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        } as unknown as typeof import('./env').env,
        logger: new FakeLogger() as unknown as typeof import('./logger').logger,
        getStripe: () =>
          ({}) as unknown as ReturnType<typeof import('./stripe').getStripe>,
        now: () => new Date('2026-02-01T00:01:00.000Z'),
      },
      repositories: {
        createQuestionRepository: vi.fn(() => questions),
        createAttemptRepository: vi.fn(() => attempts),
        createPracticeSessionRepository: vi.fn(() => sessions),
      },
    });

    await expect(
      container.createSubmitAnswerUseCase().execute({
        userId,
        sessionId,
        questionId,
        choiceId: selectedChoiceId,
      }),
    ).resolves.toMatchObject({
      isCorrect: true,
      correctChoiceId: selectedChoiceId,
    });

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });
});
