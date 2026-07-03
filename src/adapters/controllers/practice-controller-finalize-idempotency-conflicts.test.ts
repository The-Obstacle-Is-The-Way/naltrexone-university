import { describe, expect, it } from 'vitest';
import {
  PracticeSessionConflictReasons,
  practiceSessionAlreadyEndedError,
  practiceSessionStateChangedConcurrentlyError,
} from '@/src/application/errors';
import { finalizeExamAnswers } from './practice-controller';
import { createDeps } from './practice-controller-test-helpers';

describe('practice-controller finalizeExamAnswers idempotency conflicts', () => {
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
