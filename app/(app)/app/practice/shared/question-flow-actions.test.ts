import { describe, expect, it } from 'vitest';
import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import {
  buildTimeSpentSeconds,
  createTransitionedLoadAction,
  runLoadQuestionFlow,
  runTransitionedAsyncAction,
} from './question-flow-actions';

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
    const promise = runTransitionedAsyncAction({
      startTransition: (fn) => {
        fn();
      },
      run: async () => {
        throw new Error('boom');
      },
    });

    await expect(promise).resolves.toBeUndefined();
  });

  it('clears selection and submit state when question load returns non-ok after an async state mutation', async () => {
    let loadState: AsyncLoadStateWithIdle = { status: 'idle' };
    let selectedChoiceId: string | null = 'choice_1';
    let submitResult: SubmitAnswerOutput | null = {
      attemptId: 'attempt_1',
      isCorrect: false,
      correctChoiceId: 'choice_1',
      explanationMd: null,
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
});
