import { describe, expect, it, vi } from 'vitest';
import {
  buildTimeSpentSeconds,
  createTransitionedLoadAction,
  runLoadQuestionFlow,
  runSubmitAnswerFlow,
  runTransitionedAsyncAction,
} from '@/app/(app)/app/practice/shared/question-flow-actions';
import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';

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

  it('resolves transitioned async action after completion', async () => {
    let transitioned = false;

    const promise = runTransitionedAsyncAction({
      startTransition: (fn) => {
        transitioned = true;
        fn();
      },
      run: async () => {},
    });

    await expect(promise).resolves.toBeUndefined();
    expect(transitioned).toBe(true);
  });

  it('resolves transitioned async action even when it throws', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const promise = runTransitionedAsyncAction({
      startTransition: (fn) => {
        fn();
      },
      run: async () => {
        throw new Error('boom');
      },
    });

    await expect(promise).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      'runTransitionedAsyncAction: unhandled error in run()',
      expect.any(Error),
    );

    consoleSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('reports unhandled transitioned async action errors in production and still resolves', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');
    const onUnhandledError = vi.fn();

    const promise = runTransitionedAsyncAction({
      startTransition: (fn) => {
        fn();
      },
      run: async () => {
        throw error;
      },
      onUnhandledError,
    });

    await expect(promise).resolves.toBeUndefined();

    expect(onUnhandledError).toHaveBeenCalledWith(error);
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('clears selection and submit state when question load returns non-ok after an async state mutation', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'idle' };
    let selectedChoiceId: string | null = 'choice_1';
    let submitResult: SubmitAnswerOutput | null = {
      attemptId: 'attempt_1',
      isCorrect: false,
      correctChoiceId: 'choice_1',
      explanationMd: null,
      referenceMd: null,
      choiceExplanations: [],
    };
    let submitIdempotencyKey: string | null = 'idemp_1';
    let questionLoadedAt: number | null = 1234;
    let question: unknown = { questionId: 'q_1' };

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
        setSelectedChoiceId('choice_2');
        setSubmitResult({
          attemptId: 'attempt_2',
          isCorrect: true,
          correctChoiceId: 'choice_2',
          explanationMd: null,
          referenceMd: null,
          choiceExplanations: [],
        });
        setSubmitIdempotencyKey('idemp_2');
        setQuestionLoadedAt(5678);
        setQuestion({ questionId: 'q_2' });

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
    let selectedChoiceId: string | null = 'choice_1';
    let submitResult: SubmitAnswerOutput | null = {
      attemptId: 'attempt_1',
      isCorrect: false,
      correctChoiceId: 'choice_1',
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
        data: { questionId: 'q_1' },
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
    expect(question).toEqual({ questionId: 'q_1' });
    expect(questionLoadedAt).toBe(9999);
    expect(submitIdempotencyKey).toBe('idemp_new');
    expect(selectedChoiceId).toBeNull();
    expect(submitResult).toBeNull();
    expect(onLoaded).toHaveBeenCalledWith({ questionId: 'q_1' });
  });

  it('commits error state when question loading throws', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'idle' };
    let selectedChoiceId: string | null = 'choice_1';
    let submitResult: SubmitAnswerOutput | null = {
      attemptId: 'attempt_1',
      isCorrect: false,
      correctChoiceId: 'choice_1',
      explanationMd: null,
      referenceMd: null,
      choiceExplanations: [],
    };
    let submitIdempotencyKey: string | null = 'idemp_1';
    let questionLoadedAt: number | null = 1234;
    let question: unknown = { questionId: 'q_old' };

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
          data: { questionId: 'q_1' },
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
    let selectedChoiceId: string | null = 'choice_1';
    let submitResult: SubmitAnswerOutput | null = {
      attemptId: 'attempt_1',
      isCorrect: false,
      correctChoiceId: 'choice_1',
      explanationMd: null,
      referenceMd: null,
      choiceExplanations: [],
    };
    let submitIdempotencyKey: string | null = 'idemp_1';
    let questionLoadedAt: number | null = 1234;
    let question: unknown = { questionId: 'q_old' };

    const onLoaded = vi.fn();

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => ({
        ok: true,
        data: { questionId: 'q_new' },
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
    expect(question).toEqual({ questionId: 'q_old' });
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
    let question: unknown = { questionId: 'q_old' };

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
    deferred.resolve({ ok: true, data: { questionId: 'q_new' } });
    await promise;

    expect(loadState).toEqual({ status: 'loading' });
    expect(question).toEqual({ questionId: 'q_old' });
  });

  it('submits answer and commits ready state on success', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'ready' };
    let submitResult: SubmitAnswerOutput | null = null;

    await runSubmitAnswerFlow({
      question: { questionId: 'q_1' },
      selectedChoiceId: 'choice_1',
      questionLoadedAtMs: 1000,
      submitIdempotencyKey: 'idemp_1',
      submitAnswerFn: async () => ({
        ok: true,
        data: {
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
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
      expect.objectContaining({ attemptId: 'attempt_1', isCorrect: true }),
    );
    expect(loadState).toEqual({ status: 'ready' });
  });

  it('captures computed timeSpentSeconds in submit input', async () => {
    const submitAnswerFn = vi.fn(async () => ({
      ok: true as const,
      data: {
        attemptId: 'attempt_1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      },
    }));

    await runSubmitAnswerFlow({
      question: { questionId: 'q_1' },
      selectedChoiceId: 'choice_1',
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
      question: { questionId: 'q_1' },
      selectedChoiceId: 'choice_1',
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
        question: { questionId: 'q_1' },
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 1000,
        submitIdempotencyKey: null,
        submitAnswerFn: async () => ({
          ok: true,
          data: {
            attemptId: 'attempt_1',
            isCorrect: true,
            correctChoiceId: 'choice_1',
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
      question: { questionId: 'q_1' },
      selectedChoiceId: 'choice_1',
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
        attemptId: 'attempt_1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      },
    }));

    let loadState: AsyncLoadStateWithIdle = { status: 'ready' };

    await runSubmitAnswerFlow({
      question: null,
      selectedChoiceId: 'choice_1',
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
      question: { questionId: 'q_1' },
      selectedChoiceId: 'choice_1',
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
        attemptId: 'attempt_1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
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
      question: { questionId: 'q_1' },
      selectedChoiceId: 'choice_1',
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
        attemptId: 'attempt_1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
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
