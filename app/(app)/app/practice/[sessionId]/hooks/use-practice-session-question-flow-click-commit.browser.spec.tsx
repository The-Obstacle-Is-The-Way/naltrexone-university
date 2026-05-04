import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SaveExamDraftAnswerOutput } from '@/src/adapters/controllers/practice-controller';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionQuestionFlow } from './use-practice-session-question-flow';

function createSessionQuestion(
  mode: 'tutor' | 'exam',
  overrides: Partial<NextQuestion> = {},
): NextQuestion {
  return createNextQuestion({
    choices: [
      { id: 'choice_1', label: 'A', textMd: 'A', sortOrder: 1 },
      { id: 'choice_2', label: 'B', textMd: 'B', sortOrder: 2 },
    ],
    session: {
      sessionId: 'session-1',
      mode,
      index: 0,
      total: 2,
      isMarkedForReview: false,
    },
    ...overrides,
  });
}

function createSubmitOutput(
  correctChoiceId: string = 'choice_2',
): SubmitAnswerOutput {
  return {
    attemptId: 'attempt-1',
    isCorrect: true,
    correctChoiceId,
    explanationMd: null,
    referenceMd: null,
    choiceExplanations: [],
  };
}

describe('usePracticeSessionQuestionFlow click-to-commit behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('commits the clicked tutor choice with the explicit choiceId', async () => {
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(createSessionQuestion('tutor')));
    const submitAnswerFn = vi
      .fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>()
      .mockResolvedValue(ok(createSubmitOutput('choice_2')));
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_1');

    harness.result.current.onSelectChoice('choice_2');

    await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
    expect(submitAnswerFn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        questionId: 'q_1',
        choiceId: 'choice_2',
      }),
    );
  });

  it('does not commit when an exam choice is selected', async () => {
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(createSessionQuestion('exam')));
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_1');

    harness.result.current.onSelectChoice('choice_2');

    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe('choice_2');
    expect(submitAnswerFn).not.toHaveBeenCalled();
  });

  it('does not double-commit tutor choices selected in the same task', async () => {
    const submitDeferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(createSessionQuestion('tutor')));
    const submitAnswerFn = vi
      .fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>()
      .mockImplementation(async () => submitDeferred.promise);
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_1');

    harness.result.current.onSelectChoice('choice_1');
    harness.result.current.onSelectChoice('choice_2');

    await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe('choice_1');
    expect(submitAnswerFn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        questionId: 'q_1',
        choiceId: 'choice_1',
      }),
    );

    submitDeferred.resolve(ok(createSubmitOutput('choice_1')));
    await expect.poll(() => harness.result.current.isPending).toBe(false);
  });

  it('does not double-commit a tutor choice while commit is pending', async () => {
    const submitDeferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(createSessionQuestion('tutor')));
    const submitAnswerFn = vi
      .fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>()
      .mockImplementation(async () => submitDeferred.promise);
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_1');

    harness.result.current.onSelectChoice('choice_1');

    await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
    await expect.poll(() => harness.result.current.isPending).toBe(true);

    harness.result.current.onSelectChoice('choice_2');

    submitDeferred.resolve(ok(createSubmitOutput('choice_1')));
    await expect.poll(() => harness.result.current.isPending).toBe(false);
    expect(submitAnswerFn).toHaveBeenCalledTimes(1);
  });

  it('does not programmatically submit while a tutor choice commit is pending', async () => {
    const submitDeferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(createSessionQuestion('tutor')));
    const submitAnswerFn = vi
      .fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>()
      .mockImplementation(async () => submitDeferred.promise);
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_1');

    harness.result.current.onSelectChoice('choice_1');

    await harness.result.current.onSubmit();

    await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
    await expect.poll(() => harness.result.current.isPending).toBe(true);
    expect(submitAnswerFn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        questionId: 'q_1',
        choiceId: 'choice_1',
      }),
    );

    await harness.result.current.onSubmit();

    expect(submitAnswerFn).toHaveBeenCalledTimes(1);
    submitDeferred.resolve(ok(createSubmitOutput('choice_1')));
    await expect.poll(() => harness.result.current.isPending).toBe(false);
    expect(submitAnswerFn).toHaveBeenCalledTimes(1);
  });

  it('does not commit a tutor choice after submitResult locks the question', async () => {
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(createSessionQuestion('tutor')));
    const submitAnswerFn = vi
      .fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>()
      .mockResolvedValue(ok(createSubmitOutput('choice_1')));
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_1');

    harness.result.current.onSelectChoice('choice_1');
    await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
    await expect
      .poll(() => harness.result.current.submitResult?.correctChoiceId ?? null)
      .toBe('choice_1');

    harness.result.current.onSelectChoice('choice_2');

    expect(submitAnswerFn).toHaveBeenCalledTimes(1);
  });
});
