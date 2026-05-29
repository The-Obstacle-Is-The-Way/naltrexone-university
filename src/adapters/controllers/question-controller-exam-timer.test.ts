import { describe, expect, it } from 'vitest';
import {
  FakeAuthGateway,
  FakeCheckEntitlementUseCase,
  FakeGetNextQuestionUseCase,
  FakeIdempotencyKeyRepository,
  FakeLogger,
  FakeRateLimiter,
  FakeSubmitAnswerUseCase,
} from '@/src/application/test-helpers/fakes';
import type { GetNextQuestionOutput } from '@/src/application/use-cases/get-next-question';
import { createUser } from '@/src/domain/test-helpers';
import type { QuestionControllerDeps } from './question-controller';
import { getNextQuestion } from './question-controller';

const sessionId = '11111111-1111-1111-1111-111111111111';

function createActiveQuestion(
  deadlineAt: string | null,
): GetNextQuestionOutput {
  const questionId = crypto.randomUUID();
  const choiceId = crypto.randomUUID();

  return {
    questionId,
    slug: 'q-1',
    stemMd: 'Stem',
    difficulty: 'easy',
    choices: [
      {
        id: choiceId,
        label: 'A',
        textMd: 'Choice',
        sortOrder: 1,
      },
    ],
    session: {
      sessionId,
      mode: deadlineAt ? 'exam' : 'tutor',
      deadlineAt,
      index: 0,
      total: 2,
      isMarkedForReview: false,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      draftSelectedChoiceId: null,
      draftCumulativeMs: 0,
    },
  };
}

function createDeps(
  getNextQuestionOutput: GetNextQuestionOutput,
): QuestionControllerDeps {
  return {
    authGateway: new FakeAuthGateway(createUser()),
    logger: new FakeLogger(),
    rateLimiter: new FakeRateLimiter(),
    idempotencyKeyRepository: new FakeIdempotencyKeyRepository(),
    now: () => new Date('2026-05-22T12:00:00Z'),
    checkEntitlementUseCase: new FakeCheckEntitlementUseCase({
      isEntitled: true,
      reason: null,
      subscriptionStatus: 'active',
      hasActiveSubscriptionPeriod: true,
    }),
    getNextQuestionUseCase: new FakeGetNextQuestionUseCase(
      getNextQuestionOutput,
    ),
    submitAnswerUseCase: new FakeSubmitAnswerUseCase({
      attemptId: '44444444-4444-4444-4444-444444444444',
      isCorrect: true,
      correctChoiceId: '55555555-5555-5555-5555-555555555555',
      explanationMd: 'Because...',
      referenceMd: null,
      choiceExplanations: [],
    }),
  };
}

describe('question-controller exam timer payloads', () => {
  it('returns deadlineAt in active exam session payloads', async () => {
    const deadlineAt = '2026-05-22T12:02:24.000Z';

    const result = await getNextQuestion(
      { sessionId },
      createDeps(createActiveQuestion(deadlineAt)),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        session: {
          mode: 'exam',
          deadlineAt,
        },
      },
    });
  });

  it('returns null deadlineAt in active tutor session payloads', async () => {
    const result = await getNextQuestion(
      { sessionId },
      createDeps(createActiveQuestion(null)),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        session: {
          mode: 'tutor',
          deadlineAt: null,
        },
      },
    });
  });
});
