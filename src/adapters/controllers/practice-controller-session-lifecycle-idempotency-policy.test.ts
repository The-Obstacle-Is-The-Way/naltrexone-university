import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';
import type {
  DiscardPracticeSessionInput,
  DiscardPracticeSessionOutput,
  EndPracticeSessionInput,
  EndPracticeSessionOutput,
} from '@/src/application/use-cases';
import {
  discardPracticeSession,
  endPracticeSession,
} from './practice-controller';
import { createDeps } from './practice-controller-test-helpers';

function createOneTimeFailureUseCase<I, O>(input: {
  output: O;
  error: unknown;
}) {
  const inputs: I[] = [];

  return {
    inputs,
    async execute(nextInput: I): Promise<O> {
      inputs.push(nextInput);
      if (inputs.length === 1) throw input.error;
      return input.output;
    },
  };
}

describe('practice-controller lifecycle idempotency policy', () => {
  it('does not cache transient end-session failures under the idempotency key', async () => {
    const endOutput = {
      sessionId: '22222222-2222-2222-2222-222222222222',
      endedAt: '2026-02-01T00:00:00.000Z',
      mode: 'tutor',
      questionCount: 1,
      totals: { answered: 0, correct: 0, accuracy: 0, durationSeconds: 0 },
    } as const satisfies EndPracticeSessionOutput;
    const endUseCase = createOneTimeFailureUseCase<
      EndPracticeSessionInput,
      EndPracticeSessionOutput
    >({
      output: endOutput,
      error: new ApplicationError('INTERNAL_ERROR', 'connection reset'),
    });
    const deps = {
      ...createDeps(),
      endPracticeSessionUseCase: endUseCase,
    };
    const input = {
      sessionId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
    } as const;

    const first = await endPracticeSession(input, deps);
    expect(first).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'connection reset' },
    });

    const second = await endPracticeSession(input, deps);
    expect(second).toEqual({ ok: true, data: endOutput });
    expect(endUseCase.inputs).toHaveLength(2);
  });

  it('does not cache a production-shaped bare end-session conflict', async () => {
    const endOutput = {
      sessionId: '22222222-2222-2222-2222-222222222222',
      endedAt: '2026-02-01T00:00:00.000Z',
      mode: 'tutor',
      questionCount: 1,
      totals: { answered: 0, correct: 0, accuracy: 0, durationSeconds: 0 },
    } as const satisfies EndPracticeSessionOutput;
    const endUseCase = createOneTimeFailureUseCase<
      EndPracticeSessionInput,
      EndPracticeSessionOutput
    >({
      output: endOutput,
      error: new ApplicationError('CONFLICT', 'Practice session already ended'),
    });
    const deps = {
      ...createDeps(),
      endPracticeSessionUseCase: endUseCase,
    };
    const input = {
      sessionId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
    } as const;

    const first = await endPracticeSession(input, deps);
    expect(first).toEqual({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Practice session already ended',
      },
    });
    await expect(endPracticeSession(input, deps)).resolves.toEqual({
      ok: true,
      data: endOutput,
    });
    expect(endUseCase.inputs).toHaveLength(2);
  });

  it('does not cache non-terminal discard use-case ApplicationErrors when idempotencyKey is reused', async () => {
    const discardUseCase = createOneTimeFailureUseCase<
      DiscardPracticeSessionInput,
      DiscardPracticeSessionOutput
    >({
      output: { discarded: true },
      error: new ApplicationError('NOT_FOUND', 'Session not found'),
    });
    const deps = {
      ...createDeps({
        rateLimiter: new FakeRateLimiter([
          { success: true, limit: 20, remaining: 19, retryAfterSeconds: 0 },
          { success: true, limit: 20, remaining: 18, retryAfterSeconds: 0 },
        ]),
      }),
      discardPracticeSessionUseCase: discardUseCase,
    };
    const input = {
      sessionId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
    } as const;

    const first = await discardPracticeSession(input, deps);
    const second = await discardPracticeSession(input, deps);

    expect(first).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Session not found' },
    });
    expect(second).toEqual({ ok: true, data: { discarded: true } });
    expect(discardUseCase.inputs).toHaveLength(2);
    expect((deps.rateLimiter as FakeRateLimiter).inputs).toHaveLength(2);
  });

  it('does not cache internal discard failures when idempotencyKey is reused', async () => {
    const discardUseCase = createOneTimeFailureUseCase<
      DiscardPracticeSessionInput,
      DiscardPracticeSessionOutput
    >({
      output: { discarded: true },
      error: new ApplicationError('INTERNAL_ERROR', 'deadlock victim'),
    });
    const deps = {
      ...createDeps({
        rateLimiter: new FakeRateLimiter([
          { success: true, limit: 20, remaining: 19, retryAfterSeconds: 0 },
          { success: true, limit: 20, remaining: 18, retryAfterSeconds: 0 },
        ]),
      }),
      discardPracticeSessionUseCase: discardUseCase,
    };
    const input = {
      sessionId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
    } as const;

    const first = await discardPracticeSession(input, deps);
    const second = await discardPracticeSession(input, deps);

    expect(first).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'deadlock victim' },
    });
    expect(second).toEqual({ ok: true, data: { discarded: true } });
    expect(discardUseCase.inputs).toHaveLength(2);
    expect((deps.rateLimiter as FakeRateLimiter).inputs).toHaveLength(2);
  });

  it('does not cache a production-shaped bare discard conflict', async () => {
    const discardUseCase = createOneTimeFailureUseCase<
      DiscardPracticeSessionInput,
      DiscardPracticeSessionOutput
    >({
      output: { discarded: true },
      error: new ApplicationError(
        'CONFLICT',
        'Practice session cannot be discarded',
      ),
    });
    const deps = {
      ...createDeps({
        rateLimiter: new FakeRateLimiter([
          { success: true, limit: 20, remaining: 19, retryAfterSeconds: 0 },
          { success: true, limit: 20, remaining: 18, retryAfterSeconds: 0 },
        ]),
      }),
      discardPracticeSessionUseCase: discardUseCase,
    };
    const input = {
      sessionId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
    } as const;

    const first = await discardPracticeSession(input, deps);
    expect(first).toEqual({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Practice session cannot be discarded',
      },
    });
    await expect(discardPracticeSession(input, deps)).resolves.toEqual({
      ok: true,
      data: { discarded: true },
    });
    expect(discardUseCase.inputs).toHaveLength(2);
    expect((deps.rateLimiter as FakeRateLimiter).inputs).toHaveLength(2);
  });
});
