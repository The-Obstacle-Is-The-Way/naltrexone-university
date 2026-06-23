import { describe, expect, it, vi } from 'vitest';
import {
  buildTimeSpentSeconds,
  createTransitionedLoadAction,
  maybeSaveDraftBeforeNavigation,
  runLoadQuestionFlow,
  runSubmitAnswerFlow,
} from '@/app/(app)/app/practice/shared/question-flow-actions';
import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SaveExamDraftAnswerOutput } from '@/src/adapters/controllers/practice-controller';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';

const {
  fixtureAttempt1Id,
  fixtureAttempt2Id,
  fixtureChoice1Id,
  fixtureChoice2Id,
  fixtureQuestion1Id,
  fixtureQuestion2Id,
  fixtureQuestionNewId,
  fixtureQuestionOldId,
  fixtureSession1Id,
} = vi.hoisted(() => ({
  fixtureAttempt1Id: crypto.randomUUID(),
  fixtureAttempt2Id: crypto.randomUUID(),
  fixtureChoice1Id: crypto.randomUUID(),
  fixtureChoice2Id: crypto.randomUUID(),
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureQuestion2Id: crypto.randomUUID(),
  fixtureQuestionNewId: crypto.randomUUID(),
  fixtureQuestionOldId: crypto.randomUUID(),
  fixtureSession1Id: crypto.randomUUID(),
}));

describe('question-flow-actions', () => {
  it('returns zero when questionLoadedAtMs is null', () => {
    expect(buildTimeSpentSeconds(null, 1_000)).toBe(0);
  });

  it('clamps computed time spent to zero when clock goes backwards', () => {
    expect(buildTimeSpentSeconds(2_000, 1_000)).toBe(0);
  });

  it('converts elapsed milliseconds to whole seconds', () => {
    expect(buildTimeSpentSeconds(1_000, 3_499)).toBe(2);
  });

  it('runs load action within startTransition', () => {
    let transitioned = false;
    let executed = false;

    const run = () => {
      executed = true;
      return Promise.resolve();
    };

    const load = createTransitionedLoadAction({
      run,
      startTransition: (fn) => {
        transitioned = true;
        fn();
      },
    });

    load();

    expect(transitioned).toBe(true);
    expect(executed).toBe(true);
  });

  it('clears selection and submit state when question load returns non-ok after an async state mutation', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'idle' };
    let selectedChoiceId: string | null = fixtureChoice1Id;
    let submitResult: SubmitAnswerOutput | null = {
      attemptId: fixtureAttempt1Id,
      isCorrect: false,
      correctChoiceId: fixtureChoice1Id,
      explanationMd: null,
      referenceMd: null,
      choiceExplanations: [],
    };
    let submitIdempotencyKey: string | null = 'idemp_1';
    let questionLoadedAt: number | null = 1234;
    let question: unknown = { questionId: fixtureQuestion1Id };

    const setLoadState = (next: AsyncLoadStateWithIdle) => {
      loadState = next;
    };
    const setSelectedChoiceId = (next: string | null) => {
      selectedChoiceId = next;
    };
    const setSubmitResult = (next: SubmitAnswerOutput | null) => {
      submitResult = next;
    };
    const setSubmitIdempotencyKey = (next: string | null) => {
      submitIdempotencyKey = next;
    };
    const setQuestionLoadedAt = (next: number | null) => {
      questionLoadedAt = next;
    };
    const setQuestion = (next: unknown) => {
      question = next;
    };

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => {
        // Simulate an async update happening after the initial reset but before the
        // request resolves (e.g., user input or another effect).
        setSelectedChoiceId(fixtureChoice2Id);
        setSubmitResult({
          attemptId: fixtureAttempt2Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice2Id,
          explanationMd: null,
          referenceMd: null,
          choiceExplanations: [],
        });
        setSubmitIdempotencyKey('idemp_2');
        setQuestionLoadedAt(5678);
        setQuestion({ questionId: fixtureQuestion2Id });

        return {
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'boom' },
        };
      },
      createIdempotencyKey: () => 'idemp_3',
      nowMs: () => 9999,
      setLoadState,
      setSelectedChoiceId,
      setSubmitResult,
      setSubmitIdempotencyKey,
      setQuestionLoadedAt,
      setQuestion,
    });

    expect(loadState).toEqual({ status: 'error', message: 'boom' });
    expect(question).toBeNull();
    expect(selectedChoiceId).toBeNull();
    expect(submitResult).toBeNull();
    expect(submitIdempotencyKey).toBeNull();
    expect(questionLoadedAt).toBeNull();
  });

  it('loads question data and commits ready state on success', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'idle' };
    let selectedChoiceId: string | null = fixtureChoice1Id;
    let submitResult: SubmitAnswerOutput | null = {
      attemptId: fixtureAttempt1Id,
      isCorrect: false,
      correctChoiceId: fixtureChoice1Id,
      explanationMd: null,
      referenceMd: null,
      choiceExplanations: [],
    };
    let submitIdempotencyKey: string | null = 'idemp_1';
    let questionLoadedAt: number | null = 1234;
    let question: unknown = null;

    const onLoaded = vi.fn();

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => ({
        ok: true,
        data: { questionId: fixtureQuestion1Id },
      }),
      createIdempotencyKey: () => 'idemp_new',
      nowMs: () => 9999,
      setLoadState: (next) => {
        loadState = next;
      },
      setSelectedChoiceId: (next) => {
        selectedChoiceId = next;
      },
      setSubmitResult: (next) => {
        submitResult = next;
      },
      setSubmitIdempotencyKey: (next) => {
        submitIdempotencyKey = next;
      },
      setQuestionLoadedAt: (next) => {
        questionLoadedAt = next;
      },
      setQuestion: (next) => {
        question = next;
      },
      onLoaded,
    });

    expect(loadState).toEqual({ status: 'ready' });
    expect(question).toEqual({ questionId: fixtureQuestion1Id });
    expect(questionLoadedAt).toBe(9999);
    expect(submitIdempotencyKey).toBe('idemp_new');
    expect(selectedChoiceId).toBeNull();
    expect(submitResult).toBeNull();
    expect(onLoaded).toHaveBeenCalledWith({ questionId: fixtureQuestion1Id });
  });

  it('does not commit the generic empty state when null-question recovery handles the load', async () => {
    const setLoadState = vi.fn();
    const setQuestion = vi.fn();
    const onLoaded = vi.fn();
    const recoverNullQuestion = vi.fn(async () => true);

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => ({
        ok: true,
        data: null,
      }),
      createIdempotencyKey: () => 'idemp_new',
      nowMs: () => 9999,
      setLoadState,
      setSelectedChoiceId: () => undefined,
      setSubmitResult: () => undefined,
      setSubmitIdempotencyKey: () => undefined,
      setQuestionLoadedAt: () => undefined,
      setQuestion,
      onLoaded,
      recoverNullQuestion,
    });

    expect(recoverNullQuestion).toHaveBeenCalledOnce();
    expect(setQuestion).not.toHaveBeenCalled();
    expect(onLoaded).not.toHaveBeenCalled();
    expect(setLoadState).toHaveBeenCalledOnce();
    expect(setLoadState).toHaveBeenCalledWith({ status: 'loading' });
  });

  it('commits the generic empty state when null-question recovery declines the load', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'idle' };
    let question: unknown = { questionId: fixtureQuestionOldId };
    const onLoaded = vi.fn();
    const recoverNullQuestion = vi.fn(async () => false);

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => ({
        ok: true,
        data: null,
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
      onLoaded,
      recoverNullQuestion,
    });

    expect(recoverNullQuestion).toHaveBeenCalledOnce();
    expect(loadState).toEqual({ status: 'ready' });
    expect(question).toBeNull();
    expect(onLoaded).toHaveBeenCalledWith(null);
  });

  it('does not invoke null-question recovery when a real question loads', async () => {
    const recoverNullQuestion = vi.fn(async () => true);

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => ({
        ok: true,
        data: { questionId: fixtureQuestion1Id },
      }),
      createIdempotencyKey: () => 'idemp_new',
      nowMs: () => 9999,
      setLoadState: () => undefined,
      setSelectedChoiceId: () => undefined,
      setSubmitResult: () => undefined,
      setSubmitIdempotencyKey: () => undefined,
      setQuestionLoadedAt: () => undefined,
      setQuestion: () => undefined,
      recoverNullQuestion,
    });

    expect(recoverNullQuestion).not.toHaveBeenCalled();
  });

  it('uses the standard read timeout tier when loading questions', async () => {
    vi.useFakeTimers();
    try {
      let loadState: AsyncLoadStateWithIdle = { status: 'idle' };
      let selectedChoiceId: string | null = fixtureChoice1Id;
      let submitResult: SubmitAnswerOutput | null = {
        attemptId: fixtureAttempt1Id,
        isCorrect: false,
        correctChoiceId: fixtureChoice1Id,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      };
      let submitIdempotencyKey: string | null = 'idemp_1';
      let questionLoadedAt: number | null = 1234;
      let question: unknown = { questionId: fixtureQuestionOldId };

      const promise = runLoadQuestionFlow({
        requestInput: {},
        getQuestionFn: async () => new Promise<never>(() => {}),
        createIdempotencyKey: () => 'idemp_new',
        nowMs: () => 9999,
        setLoadState: (next) => {
          loadState = next;
        },
        setSelectedChoiceId: (next) => {
          selectedChoiceId = next;
        },
        setSubmitResult: (next) => {
          submitResult = next;
        },
        setSubmitIdempotencyKey: (next) => {
          submitIdempotencyKey = next;
        },
        setQuestionLoadedAt: (next) => {
          questionLoadedAt = next;
        },
        setQuestion: (next) => {
          question = next;
        },
      });

      await vi.advanceTimersByTimeAsync(10_000);
      await promise;

      expect(loadState).toEqual({
        status: 'error',
        message: 'Request timed out. Please try again.',
      });
      expect(question).toBeNull();
      expect(selectedChoiceId).toBeNull();
      expect(submitResult).toBeNull();
      expect(submitIdempotencyKey).toBeNull();
      expect(questionLoadedAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('commits error state when question loading throws', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'idle' };
    let selectedChoiceId: string | null = fixtureChoice1Id;
    let submitResult: SubmitAnswerOutput | null = {
      attemptId: fixtureAttempt1Id,
      isCorrect: false,
      correctChoiceId: fixtureChoice1Id,
      explanationMd: null,
      referenceMd: null,
      choiceExplanations: [],
    };
    let submitIdempotencyKey: string | null = 'idemp_1';
    let questionLoadedAt: number | null = 1234;
    let question: unknown = { questionId: fixtureQuestionOldId };

    const onLoaded = vi.fn();

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => {
        throw new Error('Network down');
      },
      createIdempotencyKey: () => 'idemp_new',
      nowMs: () => 9999,
      setLoadState: (next) => {
        loadState = next;
      },
      setSelectedChoiceId: (next) => {
        selectedChoiceId = next;
      },
      setSubmitResult: (next) => {
        submitResult = next;
      },
      setSubmitIdempotencyKey: (next) => {
        submitIdempotencyKey = next;
      },
      setQuestionLoadedAt: (next) => {
        questionLoadedAt = next;
      },
      setQuestion: (next) => {
        question = next;
      },
      onLoaded,
    });

    expect(loadState).toEqual({ status: 'error', message: 'Network down' });
    expect(question).toBeNull();
    expect(selectedChoiceId).toBeNull();
    expect(submitResult).toBeNull();
    expect(submitIdempotencyKey).toBeNull();
    expect(questionLoadedAt).toBeNull();
    expect(onLoaded).toHaveBeenCalledWith(null);
  });

  it('throws when request sequencing hooks are partially provided for load flow', async () => {
    await expect(
      runLoadQuestionFlow({
        requestInput: {},
        getQuestionFn: async () => ({
          ok: true,
          data: { questionId: fixtureQuestion1Id },
        }),
        createIdempotencyKey: () => 'idemp_new',
        nowMs: () => 9999,
        setLoadState: () => undefined,
        setSelectedChoiceId: () => undefined,
        setSubmitResult: () => undefined,
        setSubmitIdempotencyKey: () => undefined,
        setQuestionLoadedAt: () => undefined,
        setQuestion: () => undefined,
        createRequestSequenceId: () => 1,
      }),
    ).rejects.toThrow('Request sequencing hooks must be provided together');
  });

  it('does not commit stale request results', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'idle' };
    let selectedChoiceId: string | null = fixtureChoice1Id;
    let submitResult: SubmitAnswerOutput | null = {
      attemptId: fixtureAttempt1Id,
      isCorrect: false,
      correctChoiceId: fixtureChoice1Id,
      explanationMd: null,
      referenceMd: null,
      choiceExplanations: [],
    };
    let submitIdempotencyKey: string | null = 'idemp_1';
    let questionLoadedAt: number | null = 1234;
    let question: unknown = { questionId: fixtureQuestionOldId };

    const onLoaded = vi.fn();

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => ({
        ok: true,
        data: { questionId: fixtureQuestionNewId },
      }),
      createIdempotencyKey: () => 'idemp_new',
      nowMs: () => 9999,
      setLoadState: (next) => {
        loadState = next;
      },
      setSelectedChoiceId: (next) => {
        selectedChoiceId = next;
      },
      setSubmitResult: (next) => {
        submitResult = next;
      },
      setSubmitIdempotencyKey: (next) => {
        submitIdempotencyKey = next;
      },
      setQuestionLoadedAt: (next) => {
        questionLoadedAt = next;
      },
      setQuestion: (next) => {
        question = next;
      },
      onLoaded,
      createRequestSequenceId: () => 1,
      isLatestRequest: () => false,
    });

    expect(loadState).toEqual({ status: 'loading' });
    expect(question).toEqual({ questionId: fixtureQuestionOldId });
    expect(selectedChoiceId).toBeNull();
    expect(submitResult).toBeNull();
    expect(submitIdempotencyKey).toBeNull();
    expect(questionLoadedAt).toBeNull();
    expect(onLoaded).not.toHaveBeenCalled();
  });

  it('does not commit results after unmount', async () => {
    const deferred = createDeferred<ActionResult<unknown>>();
    let mounted = true;
    let loadState: AsyncLoadStateWithIdle = { status: 'idle' };
    let question: unknown = { questionId: fixtureQuestionOldId };

    const promise = runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => deferred.promise,
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
      createRequestSequenceId: () => 1,
      isLatestRequest: () => true,
      isMounted: () => mounted,
    });

    mounted = false;
    deferred.resolve({ ok: true, data: { questionId: fixtureQuestionNewId } });
    await promise;

    expect(loadState).toEqual({ status: 'loading' });
    expect(question).toEqual({ questionId: fixtureQuestionOldId });
  });

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
    });

    expect(loadState).toEqual({ status: 'error', message: 'Submit failed' });
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
    });

    expect(loadState).toEqual({ status: 'error', message: 'boom' });
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

  it('saves an exam draft before navigation when the selection changed', async () => {
    const loadStateTransitions: AsyncLoadStateWithIdle[] = [];
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue(
        ok({
          questionId: fixtureQuestion1Id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: fixtureChoice2Id,
          draftSavedAt: '2026-02-01T00:00:00.000Z',
          draftCumulativeMs: 50_000,
        }),
      );
    const onSaved = vi.fn();

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
          draftSelectedChoiceId: fixtureChoice1Id,
          draftCumulativeMs: 30_000,
        },
      },
      selectedChoiceId: fixtureChoice2Id,
      currentCumulativeMs: 50_000,
      lastSavedDraftSelectedChoiceId: fixtureChoice1Id,
      lastSavedDraftCumulativeMs: 30_000,
      saveExamDraftAnswerFn,
      setLoadState: (state) => {
        loadStateTransitions.push(state);
      },
      onSaved,
    });

    expect(saveResult).toEqual({ ok: true });
    expect(saveExamDraftAnswerFn).toHaveBeenCalledWith({
      sessionId: fixtureSession1Id,
      questionId: fixtureQuestion1Id,
      selectedChoiceId: fixtureChoice2Id,
      cumulativeMs: 50_000,
    });
    expect(onSaved).toHaveBeenCalledWith({
      questionId: fixtureQuestion1Id,
      selectedChoiceId: fixtureChoice2Id,
      cumulativeMs: 50_000,
    });
    expect(loadStateTransitions).toEqual([]);
  });

  it('saves an exam draft before navigation when only cumulative time advanced', async () => {
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue(
        ok({
          questionId: fixtureQuestion1Id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: fixtureChoice1Id,
          draftSavedAt: '2026-02-01T00:00:00.000Z',
          draftCumulativeMs: 50_000,
        }),
      );

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
          draftSelectedChoiceId: fixtureChoice1Id,
          draftCumulativeMs: 30_000,
        },
      },
      selectedChoiceId: fixtureChoice1Id,
      currentCumulativeMs: 50_000,
      lastSavedDraftSelectedChoiceId: fixtureChoice1Id,
      lastSavedDraftCumulativeMs: 30_000,
      saveExamDraftAnswerFn,
      setLoadState: () => {},
    });

    expect(saveResult).toEqual({ ok: true });
    expect(saveExamDraftAnswerFn).toHaveBeenCalledWith({
      sessionId: fixtureSession1Id,
      questionId: fixtureQuestion1Id,
      selectedChoiceId: fixtureChoice1Id,
      cumulativeMs: 50_000,
    });
  });

  it('preserves an explicit null draftSelectedChoiceId returned by the server', async () => {
    const onSaved = vi.fn();
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue(
        ok({
          questionId: fixtureQuestion1Id,
          markedForReview: false,
          latestSelectedChoiceId: fixtureChoice2Id,
          latestIsCorrect: true,
          latestAnsweredAt: '2026-02-01T00:00:00.000Z',
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 50_000,
        }),
      );

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
          draftSelectedChoiceId: fixtureChoice1Id,
          draftCumulativeMs: 30_000,
        },
      },
      selectedChoiceId: fixtureChoice2Id,
      currentCumulativeMs: 50_000,
      lastSavedDraftSelectedChoiceId: fixtureChoice1Id,
      lastSavedDraftCumulativeMs: 30_000,
      saveExamDraftAnswerFn,
      setLoadState: () => {},
      onSaved,
    });

    expect(saveResult).toEqual({ ok: true });
    expect(onSaved).toHaveBeenCalledWith({
      questionId: fixtureQuestion1Id,
      selectedChoiceId: null,
      cumulativeMs: 50_000,
    });
  });

  it('persists cumulative time for unanswered exam questions before navigation', async () => {
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue(
        ok({
          questionId: fixtureQuestion1Id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: '2026-02-01T00:00:00.000Z',
          draftCumulativeMs: 15_000,
        }),
      );
    const onSaved = vi.fn();

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
        },
      },
      selectedChoiceId: null,
      currentCumulativeMs: 15_000,
      lastSavedDraftSelectedChoiceId: null,
      lastSavedDraftCumulativeMs: 0,
      saveExamDraftAnswerFn,
      setLoadState: () => {},
      onSaved,
    });

    expect(saveResult).toEqual({ ok: true });
    expect(saveExamDraftAnswerFn).toHaveBeenCalledWith({
      sessionId: fixtureSession1Id,
      questionId: fixtureQuestion1Id,
      selectedChoiceId: null,
      cumulativeMs: 15_000,
    });
    expect(onSaved).toHaveBeenCalledWith({
      questionId: fixtureQuestion1Id,
      selectedChoiceId: null,
      cumulativeMs: 15_000,
    });
  });

  it('does not save a time-only exam draft when cumulative time did not advance', async () => {
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();
    const onSaved = vi.fn();

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
        },
      },
      selectedChoiceId: null,
      currentCumulativeMs: 15_000,
      lastSavedDraftSelectedChoiceId: null,
      lastSavedDraftCumulativeMs: 15_000,
      saveExamDraftAnswerFn,
      setLoadState: () => {},
      onSaved,
    });

    expect(saveResult).toEqual({ ok: true });
    expect(saveExamDraftAnswerFn).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('blocks navigation and sets load error when draft save fails', async () => {
    const loadStates: AsyncLoadStateWithIdle[] = [];
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Draft save failed' },
      });

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
        },
      },
      selectedChoiceId: fixtureChoice1Id,
      currentCumulativeMs: 50_000,
      lastSavedDraftSelectedChoiceId: null,
      lastSavedDraftCumulativeMs: 0,
      saveExamDraftAnswerFn,
      setLoadState: (state) => {
        loadStates.push(state);
      },
    });

    expect(saveResult).toEqual({ ok: false, code: 'INTERNAL_ERROR' });
    expect(loadStates.at(-1)).toEqual({
      status: 'error',
      message: 'Draft save failed',
    });
  });
});
