import { describe, expect, it, vi } from 'vitest';
import { runSubmitAnswerFlow } from '@/app/(app)/app/practice/shared/question-flow-actions';
import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';

const fixtureAttempt1Id = crypto.randomUUID();
const fixtureChoice1Id = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();

describe('question-flow-actions', () => {
  it('submits answer and commits ready state on success', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'ready' };
    let submitResult: SubmitAnswerOutput | null = null;

    await runSubmitAnswerFlow({
      question: { questionId: fixtureQuestion1Id },
      selectedChoiceId: fixtureChoice1Id,
      questionLoadedAtMs: 1000,
      submitIdempotencyKey: 'idemp_1',
      submitAnswerFn: async () => ({
        ok: true,
        data: {
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: null,
          referenceMd: null,
          choiceExplanations: [],
        },
      }),
      buildSubmitInput: (request) => ({
        ...request,
      }),
      nowMs: () => 4000,
      setLoadState: (next) => {
        loadState = next;
      },
      setSubmitResult: (next) => {
        submitResult = next;
      },
    });

    expect(submitResult).toEqual(
      expect.objectContaining({
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
      }),
    );
    expect(loadState).toEqual({ status: 'ready' });
  });

  it('captures computed timeSpentSeconds in submit input', async () => {
    const submitAnswerFn = vi.fn(async () => ({
      ok: true as const,
      data: {
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      },
    }));

    await runSubmitAnswerFlow({
      question: { questionId: fixtureQuestion1Id },
      selectedChoiceId: fixtureChoice1Id,
      questionLoadedAtMs: 1000,
      submitIdempotencyKey: null,
      submitAnswerFn,
      buildSubmitInput: (request) => request,
      nowMs: () => 3500,
      setLoadState: () => undefined,
      setSubmitResult: () => undefined,
    });

    expect(submitAnswerFn).toHaveBeenCalledWith(
      expect.objectContaining({ timeSpentSeconds: 2 }),
    );
  });

  it('commits error state when submit request throws', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'ready' };
    const rotateIdempotencyKey = vi.fn();

    await runSubmitAnswerFlow({
      question: { questionId: fixtureQuestion1Id },
      selectedChoiceId: fixtureChoice1Id,
      questionLoadedAtMs: 1000,
      submitIdempotencyKey: null,
      submitAnswerFn: async () => {
        throw new Error('Submit failed');
      },
      buildSubmitInput: () => ({}),
      nowMs: () => 3500,
      setLoadState: (next) => {
        loadState = next;
      },
      setSubmitResult: () => undefined,
      rotateIdempotencyKey,
    });

    expect(loadState).toEqual({ status: 'error', message: 'Submit failed' });
    expect(rotateIdempotencyKey).not.toHaveBeenCalled();
  });

  it('throws when request sequencing hooks are partially provided for submit flow', async () => {
    await expect(
      runSubmitAnswerFlow({
        question: { questionId: fixtureQuestion1Id },
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 1000,
        submitIdempotencyKey: null,
        submitAnswerFn: async () => ({
          ok: true,
          data: {
            attemptId: fixtureAttempt1Id,
            isCorrect: true,
            correctChoiceId: fixtureChoice1Id,
            explanationMd: null,
            referenceMd: null,
            choiceExplanations: [],
          },
        }),
        buildSubmitInput: () => ({}),
        nowMs: () => 3500,
        setLoadState: () => undefined,
        setSubmitResult: () => undefined,
        isLatestRequest: () => true,
      }),
    ).rejects.toThrow('Request sequencing hooks must be provided together');
  });

  it('commits error state when submit response is non-ok', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'ready' };
    const rotateIdempotencyKey = vi.fn();

    await runSubmitAnswerFlow({
      question: { questionId: fixtureQuestion1Id },
      selectedChoiceId: fixtureChoice1Id,
      questionLoadedAtMs: 1000,
      submitIdempotencyKey: null,
      submitAnswerFn: async () => ({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'boom' },
      }),
      buildSubmitInput: () => ({}),
      nowMs: () => 3500,
      setLoadState: (next) => {
        loadState = next;
      },
      setSubmitResult: () => undefined,
      rotateIdempotencyKey,
    });

    expect(loadState).toEqual({ status: 'error', message: 'boom' });
    expect(rotateIdempotencyKey).not.toHaveBeenCalled();
  });

  it('rotates the submit key after a determinate cached failure', async () => {
    const rotateIdempotencyKey = vi.fn();

    await runSubmitAnswerFlow({
      question: { questionId: fixtureQuestion1Id },
      selectedChoiceId: fixtureChoice1Id,
      questionLoadedAtMs: 1000,
      submitIdempotencyKey: 'idemp_1',
      submitAnswerFn: async () => ({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      }),
      buildSubmitInput: () => ({}),
      nowMs: () => 3500,
      setLoadState: () => undefined,
      setSubmitResult: () => undefined,
      rotateIdempotencyKey,
    });

    expect(rotateIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  it('preserves the submit key while a concurrent same-key request may still finish', async () => {
    const rotateIdempotencyKey = vi.fn();

    await runSubmitAnswerFlow({
      question: { questionId: fixtureQuestion1Id },
      selectedChoiceId: fixtureChoice1Id,
      questionLoadedAtMs: 1000,
      submitIdempotencyKey: 'idemp_1',
      submitAnswerFn: async () => ({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Request is still running',
          details: { reason: 'concurrent_request_in_progress' },
        },
      }),
      buildSubmitInput: () => ({}),
      nowMs: () => 3500,
      setLoadState: () => undefined,
      setSubmitResult: () => undefined,
      rotateIdempotencyKey,
    });

    expect(rotateIdempotencyKey).not.toHaveBeenCalled();
  });

  it('bails out without committing when question is missing', async () => {
    const submitAnswerFn = vi.fn(async () => ({
      ok: true as const,
      data: {
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      },
    }));

    let loadState: AsyncLoadStateWithIdle = { status: 'ready' };

    await runSubmitAnswerFlow({
      question: null,
      selectedChoiceId: fixtureChoice1Id,
      questionLoadedAtMs: 1000,
      submitIdempotencyKey: null,
      submitAnswerFn,
      buildSubmitInput: () => ({}),
      nowMs: () => 3500,
      setLoadState: (next) => {
        loadState = next;
      },
      setSubmitResult: () => undefined,
    });

    expect(submitAnswerFn).not.toHaveBeenCalled();
    expect(loadState).toEqual({ status: 'ready' });
  });

  it('does not commit results after unmount during submit', async () => {
    const deferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
    let mounted = true;
    let loadState: AsyncLoadStateWithIdle = { status: 'ready' };
    let submitResult: SubmitAnswerOutput | null = null;

    const promise = runSubmitAnswerFlow({
      question: { questionId: fixtureQuestion1Id },
      selectedChoiceId: fixtureChoice1Id,
      questionLoadedAtMs: 1000,
      submitIdempotencyKey: null,
      submitAnswerFn: async () => deferred.promise,
      buildSubmitInput: (request) => request,
      nowMs: () => 3500,
      setLoadState: (next) => {
        loadState = next;
      },
      setSubmitResult: (next) => {
        submitResult = next;
      },
      isMounted: () => mounted,
    });

    mounted = false;
    deferred.resolve(
      ok({
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );
    await promise;

    expect(loadState).toEqual({ status: 'ready' });
    expect(submitResult).toBeNull();
  });

  it('does not commit stale submit responses when a newer request exists', async () => {
    const deferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
    let submitResult: SubmitAnswerOutput | null = null;

    const setLoadState = vi.fn();
    const setSubmitResult = vi.fn(
      (next: SubmitAnswerOutput | null, _questionId?: string | null) => {
        submitResult = next;
      },
    );
    const onSuccess = vi.fn();

    const input: Parameters<typeof runSubmitAnswerFlow>[0] = {
      question: { questionId: fixtureQuestion1Id },
      selectedChoiceId: fixtureChoice1Id,
      questionLoadedAtMs: 1000,
      submitIdempotencyKey: null,
      submitAnswerFn: async () => deferred.promise,
      buildSubmitInput: (request) => request,
      nowMs: () => 3500,
      setLoadState,
      setSubmitResult,
      onSuccess,
      isMounted: () => true,
      createRequestSequenceId: () => 1,
      isLatestRequest: () => false,
    };

    const promise = runSubmitAnswerFlow(input);

    deferred.resolve(
      ok({
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );
    await promise;

    expect(submitResult).toBeNull();
    expect(setSubmitResult).not.toHaveBeenCalled();
    expect(setLoadState).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
