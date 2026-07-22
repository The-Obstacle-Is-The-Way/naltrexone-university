import { describe, expect, it } from 'vitest';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';
import type { FinalizeExamAnswersOutput } from '@/src/application/use-cases';
import { endPracticeSession, finalizeExamAnswers } from './practice-controller';
import { createDeps } from './practice-controller-test-helpers';

describe('practice-controller session admission', () => {
  it('limits a fresh keyed end before executing the use case', async () => {
    const rateLimiter = new FakeRateLimiter({
      success: false,
      limit: 60,
      remaining: 0,
      retryAfterSeconds: 30,
    });
    const deps = createDeps({ rateLimiter });

    const result = await endPracticeSession(
      {
        sessionId: '11111111-1111-1111-1111-111111111111',
        idempotencyKey: '22222222-2222-2222-2222-222222222222',
      },
      deps,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(deps.endPracticeSessionUseCase.inputs).toEqual([]);
    expect(rateLimiter.inputs).toEqual([
      {
        key: `practice:endPracticeSession:${deps._fixtures.userId}`,
        limit: 60,
        windowMs: 60_000,
      },
    ]);
  });

  it('limits a fresh keyed finalize before executing the use case', async () => {
    const rateLimiter = new FakeRateLimiter({
      success: false,
      limit: 60,
      remaining: 0,
      retryAfterSeconds: 30,
    });
    const deps = createDeps({ rateLimiter });

    const result = await finalizeExamAnswers(
      {
        sessionId: '11111111-1111-1111-1111-111111111111',
        idempotencyKey: '22222222-2222-2222-2222-222222222222',
      },
      deps,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(deps.finalizeExamAnswersUseCase.inputs).toEqual([]);
    expect(rateLimiter.inputs).toEqual([
      {
        key: `practice:finalizeExamAnswers:${deps._fixtures.userId}`,
        limit: 60,
        windowMs: 60_000,
      },
    ]);
  });

  it('replays identical field errors when keyed finalize output is invalid', async () => {
    const invalidFinalizeOutput = {
      sessionId: '22222222-2222-2222-2222-222222222222',
      endedAt: '2026-02-01T00:00:00.000Z',
      mode: 'exam',
      questionCount: -1,
      totals: {
        answered: 2,
        correct: 1,
        accuracy: 0.5,
        durationSeconds: 60,
      },
    } satisfies FinalizeExamAnswersOutput;
    const rateLimiter = new FakeRateLimiter();
    const deps = createDeps({
      finalizeOutput: invalidFinalizeOutput,
      rateLimiter,
    });
    const input = {
      sessionId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: '22222222-2222-2222-2222-222222222222',
    } as const;

    const first = await finalizeExamAnswers(input, deps);
    const second = await finalizeExamAnswers(input, deps);

    expect(first).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: {
          questionCount: ['Too small: expected number to be >=0'],
          totals: ['answered must be <= questionCount'],
        },
      },
    });
    expect(second).toEqual(first);
    expect(deps.finalizeExamAnswersUseCase.inputs).toHaveLength(1);
    expect(rateLimiter.inputs).toHaveLength(1);
  });
});
