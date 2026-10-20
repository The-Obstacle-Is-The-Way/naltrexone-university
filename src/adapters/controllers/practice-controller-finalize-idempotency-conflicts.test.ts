import { describe, expect, it } from 'vitest';
import {
  PracticeSessionConflictReasons,
  practiceSessionAlreadyEndedError,
  practiceSessionStateChangedConcurrentlyError,
} from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createFinalizeQuestion,
  passthroughTransaction,
} from '@/src/application/test-helpers/finalize-exam-fixtures';
import { FinalizeExamAnswersUseCase } from '@/src/application/use-cases/finalize-exam-answers';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { finalizeExamAnswers } from './practice-controller';
import { createDeps } from './test-helpers/practice-controller-test-helpers';

describe('practice-controller finalizeExamAnswers idempotency conflicts', () => {
  it('forwards expiry-only intent even without a final draft', async () => {
    const deps = createDeps();
    const sessionId = crypto.randomUUID();

    const result = await finalizeExamAnswers(
      { sessionId, onlyIfExpired: true },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(deps.finalizeExamAnswersUseCase.inputs).toEqual([
      { userId: deps._fixtures.userId, sessionId, onlyIfExpired: true },
    ]);
  });

  it('retries an early expiry with the same key and grades its final draft at the server deadline', async () => {
    const deps = createDeps();
    const questionId = crypto.randomUUID();
    const correctChoiceId = crypto.randomUUID();
    const question = createFinalizeQuestion(
      questionId,
      correctChoiceId,
      crypto.randomUUID(),
    );
    const session = createPracticeSession({
      userId: deps._fixtures.userId,
      mode: 'exam',
      questionIds: [questionId],
      startedAt: new Date('2026-05-22T12:00:00.000Z'),
    });
    const questions = new FakeQuestionRepository([question]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([session]);
    let now = new Date('2026-05-22T12:01:11.999Z');
    const realDeps = {
      ...deps,
      finalizeExamAnswersUseCase: new FinalizeExamAnswersUseCase(
        questions,
        attempts,
        sessions,
        passthroughTransaction(questions, attempts, sessions),
        () => now,
      ),
    };
    const input = {
      sessionId: session.id,
      idempotencyKey: crypto.randomUUID(),
      onlyIfExpired: true,
      finalDraftAnswer: {
        questionId,
        selectedChoiceId: correctChoiceId,
        cumulativeMs: 1_000,
      },
    };

    await expect(finalizeExamAnswers(input, realDeps)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', details: { reason: 'exam_not_expired' } },
    });
    await expect(
      deps.idempotencyKeyRepository.find(
        session.userId,
        'practice:finalizeExamAnswers',
        input.idempotencyKey,
      ),
    ).resolves.toBeNull();

    now = new Date('2026-05-22T12:01:12.000Z');
    await expect(finalizeExamAnswers(input, realDeps)).resolves.toMatchObject({
      ok: true,
      data: { totals: { answered: 1, correct: 1 } },
    });
    await expect(
      attempts.findBySessionId(session.id, session.userId),
    ).resolves.toMatchObject([
      { outcome: { kind: 'answered', selectedChoiceId: correctChoiceId } },
    ]);
  });

  it('does not cache transient practice-session state conflicts under the finalize idempotency key', async () => {
    const transientConflict = practiceSessionStateChangedConcurrentlyError();
    const deps = createDeps({ finalizeThrows: transientConflict });
    const input = {
      sessionId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
    } as const;

    const first = await finalizeExamAnswers(input, deps);
    const second = await finalizeExamAnswers(input, deps);

    expect(first).toEqual({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Practice session state changed concurrently; please retry.',
        details: {
          reason: PracticeSessionConflictReasons.StateChangedConcurrently,
        },
      },
    });
    expect(second).toEqual(first);
    expect(deps.finalizeExamAnswersUseCase.inputs).toHaveLength(2);
    await expect(
      deps.idempotencyKeyRepository.find(
        deps._fixtures.userId,
        'practice:finalizeExamAnswers',
        input.idempotencyKey,
      ),
    ).resolves.toBeNull();
  });

  it('caches terminal practice-session conflicts with details under the finalize idempotency key', async () => {
    const terminalConflict = practiceSessionAlreadyEndedError();
    const deps = createDeps({ finalizeThrows: terminalConflict });
    const input = {
      sessionId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
    } as const;

    const first = await finalizeExamAnswers(input, deps);
    const second = await finalizeExamAnswers(input, deps);

    expect(first).toEqual({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Practice session already ended',
        details: {
          reason: PracticeSessionConflictReasons.AlreadyEnded,
        },
      },
    });
    expect(second).toEqual(first);
    expect(deps.finalizeExamAnswersUseCase.inputs).toHaveLength(1);
  });
});
