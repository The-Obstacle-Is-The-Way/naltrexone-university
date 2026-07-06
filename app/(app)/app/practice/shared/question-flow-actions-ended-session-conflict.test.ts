import { describe, expect, it, vi } from 'vitest';
import {
  runLoadQuestionFlow,
  runSubmitAnswerFlow,
} from '@/app/(app)/app/practice/shared/question-flow-actions';
import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import { PracticeSessionConflictReasons } from '@/src/application/errors';

const { fixtureChoice1Id, fixtureQuestion1Id, fixtureQuestionOldId } =
  vi.hoisted(() => ({
    fixtureChoice1Id: crypto.randomUUID(),
    fixtureQuestion1Id: crypto.randomUUID(),
    fixtureQuestionOldId: crypto.randomUUID(),
  }));

describe('question-flow-actions ended-session conflict recovery', () => {
  it('runs ended-session recovery instead of committing load error for structured AlreadyEnded conflicts', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'idle' };
    let question: unknown = { questionId: fixtureQuestionOldId };
    const recoverEndedSessionConflict = vi.fn(async () => {
      loadState = { status: 'ready' };
      return true;
    });

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => ({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Practice session already ended',
          details: { reason: PracticeSessionConflictReasons.AlreadyEnded },
        },
      }),
      createIdempotencyKey: () => 'idemp_new',
      nowMs: () => 9999,
      setLoadState: (next) => {
        loadState = next;
      },
      setSelectedChoiceId: () => undefined,
      setSubmitResult: () => undefined,
      setSubmitIdempotencyKey: () => undefined,
      setQuestionLoadedAt: () => undefined,
      setQuestion: (next) => {
        question = next;
      },
      recoverEndedSessionConflict,
    });

    expect(recoverEndedSessionConflict).toHaveBeenCalledTimes(1);
    expect(loadState).toEqual({ status: 'ready' });
    expect(question).toEqual({ questionId: fixtureQuestionOldId });
  });

  it('keeps reasonless load CONFLICT as a generic error', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'idle' };
    const recoverEndedSessionConflict = vi.fn(async () => true);

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => ({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Practice session already ended',
        },
      }),
      createIdempotencyKey: () => 'idemp_new',
      nowMs: () => 9999,
      setLoadState: (next) => {
        loadState = next;
      },
      setSelectedChoiceId: () => undefined,
      setSubmitResult: () => undefined,
      setSubmitIdempotencyKey: () => undefined,
      setQuestionLoadedAt: () => undefined,
      setQuestion: () => undefined,
      recoverEndedSessionConflict,
    });

    expect(recoverEndedSessionConflict).not.toHaveBeenCalled();
    expect(loadState).toEqual({
      status: 'error',
      message: 'Practice session already ended',
    });
  });

  it('runs ended-session recovery instead of committing submit error for structured AlreadyEnded conflicts', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'ready' };
    const recoverEndedSessionConflict = vi.fn(async () => {
      loadState = { status: 'ready' };
      return true;
    });

    await runSubmitAnswerFlow({
      question: { questionId: fixtureQuestion1Id },
      selectedChoiceId: fixtureChoice1Id,
      questionLoadedAtMs: 1000,
      submitIdempotencyKey: null,
      submitAnswerFn: async () => ({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Practice session already ended',
          details: { reason: PracticeSessionConflictReasons.AlreadyEnded },
        },
      }),
      buildSubmitInput: () => ({}),
      nowMs: () => 3500,
      setLoadState: (next) => {
        loadState = next;
      },
      setSubmitResult: () => undefined,
      recoverEndedSessionConflict,
    });

    expect(recoverEndedSessionConflict).toHaveBeenCalledTimes(1);
    expect(loadState).toEqual({ status: 'ready' });
  });

  it('keeps reasonless submit CONFLICT as a generic error', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'ready' };
    const recoverEndedSessionConflict = vi.fn(async () => true);

    await runSubmitAnswerFlow({
      question: { questionId: fixtureQuestion1Id },
      selectedChoiceId: fixtureChoice1Id,
      questionLoadedAtMs: 1000,
      submitIdempotencyKey: null,
      submitAnswerFn: async () => ({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Practice session already ended',
        },
      }),
      buildSubmitInput: () => ({}),
      nowMs: () => 3500,
      setLoadState: (next) => {
        loadState = next;
      },
      setSubmitResult: () => undefined,
      recoverEndedSessionConflict,
    });

    expect(recoverEndedSessionConflict).not.toHaveBeenCalled();
    expect(loadState).toEqual({
      status: 'error',
      message: 'Practice session already ended',
    });
  });
});
