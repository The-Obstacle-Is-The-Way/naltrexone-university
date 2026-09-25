import { describe, expect, it, vi } from 'vitest';
import {
  buildTimeSpentSeconds,
  createTransitionedLoadAction,
  runLoadQuestionFlow,
} from '@/app/(app)/app/practice/shared/question-flow-actions';
import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

const fixtureAttempt1Id = crypto.randomUUID();
const fixtureAttempt2Id = crypto.randomUUID();
const fixtureChoice1Id = crypto.randomUUID();
const fixtureChoice2Id = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();
const fixtureQuestion2Id = crypto.randomUUID();
const fixtureQuestionNewId = crypto.randomUUID();
const fixtureQuestionOldId = crypto.randomUUID();

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
    let submitRequestToken: unknown = { key: 'idemp_1', fingerprint: 'old' };
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
    const setSubmitRequestToken = (next: unknown) => {
      submitRequestToken = next;
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
        setSubmitRequestToken({ key: 'idemp_2', fingerprint: 'new' });
        setQuestionLoadedAt(5678);
        setQuestion({ questionId: fixtureQuestion2Id });

        return {
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'boom' },
        };
      },
      nowMs: () => 9999,
      setLoadState,
      setSelectedChoiceId,
      setSubmitResult,
      setSubmitRequestToken,
      setQuestionLoadedAt,
      setQuestion,
    });

    expect(loadState).toEqual({ status: 'error', message: 'boom' });
    expect(question).toBeNull();
    expect(selectedChoiceId).toBeNull();
    expect(submitResult).toBeNull();
    expect(submitRequestToken).toBeNull();
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
    let submitRequestToken: unknown = { key: 'idemp_1', fingerprint: 'old' };
    let questionLoadedAt: number | null = 1234;
    let question: unknown = null;

    const onLoaded = vi.fn();

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => ({
        ok: true,
        data: { questionId: fixtureQuestion1Id },
      }),
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
      setSubmitRequestToken: (next) => {
        submitRequestToken = next;
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
    expect(submitRequestToken).toBeNull();
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
      nowMs: () => 9999,
      setLoadState,
      setSelectedChoiceId: () => undefined,
      setSubmitResult: () => undefined,
      setSubmitRequestToken: () => undefined,
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
      nowMs: () => 9999,
      setLoadState: (next) => {
        loadState = next;
      },
      setSelectedChoiceId: () => undefined,
      setSubmitResult: () => undefined,
      setSubmitRequestToken: () => undefined,
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
      nowMs: () => 9999,
      setLoadState: () => undefined,
      setSelectedChoiceId: () => undefined,
      setSubmitResult: () => undefined,
      setSubmitRequestToken: () => undefined,
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
      let submitRequestToken: unknown = {
        key: 'idemp_1',
        fingerprint: 'old',
      };
      let questionLoadedAt: number | null = 1234;
      let question: unknown = { questionId: fixtureQuestionOldId };

      const promise = runLoadQuestionFlow({
        requestInput: {},
        getQuestionFn: async () => new Promise<never>(() => {}),
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
        setSubmitRequestToken: (next) => {
          submitRequestToken = next;
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
      expect(submitRequestToken).toBeNull();
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
    let submitRequestToken: unknown = { key: 'idemp_1', fingerprint: 'old' };
    let questionLoadedAt: number | null = 1234;
    let question: unknown = { questionId: fixtureQuestionOldId };

    const onLoaded = vi.fn();

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => {
        throw new Error('Network down');
      },
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
      setSubmitRequestToken: (next) => {
        submitRequestToken = next;
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
    expect(submitRequestToken).toBeNull();
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
        nowMs: () => 9999,
        setLoadState: () => undefined,
        setSelectedChoiceId: () => undefined,
        setSubmitResult: () => undefined,
        setSubmitRequestToken: () => undefined,
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
    let submitRequestToken: unknown = { key: 'idemp_1', fingerprint: 'old' };
    let questionLoadedAt: number | null = 1234;
    let question: unknown = { questionId: fixtureQuestionOldId };

    const onLoaded = vi.fn();

    await runLoadQuestionFlow({
      requestInput: {},
      getQuestionFn: async () => ({
        ok: true,
        data: { questionId: fixtureQuestionNewId },
      }),
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
      setSubmitRequestToken: (next) => {
        submitRequestToken = next;
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
    expect(submitRequestToken).toBeNull();
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
      nowMs: () => 9999,
      setLoadState: (next) => {
        loadState = next;
      },
      setSelectedChoiceId: () => undefined,
      setSubmitResult: () => undefined,
      setSubmitRequestToken: () => undefined,
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
});
