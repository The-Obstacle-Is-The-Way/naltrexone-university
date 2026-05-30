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

const fixtureChoice1Id = crypto.randomUUID();
const fixtureChoice2Id = crypto.randomUUID();
const fixtureSession1Id = crypto.randomUUID();
const fixtureAttempt1Id = crypto.randomUUID();
const fixtureQ1Id = crypto.randomUUID();

function createSessionQuestion(
  mode: 'tutor' | 'exam',
  overrides: Partial<NextQuestion> = {},
): NextQuestion {
  return createNextQuestion({
    questionId: fixtureQ1Id,
    choices: [
      { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
      { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
    ],
    session: {
      sessionId: fixtureSession1Id,
      mode,
      deadlineAt: mode === 'exam' ? '2099-05-22T12:02:24.000Z' : null,
      index: 0,
      total: 2,
      isMarkedForReview: false,
    },
    ...overrides,
  });
}

function createSubmitOutput(
  correctChoiceId: string = fixtureChoice2Id,
): SubmitAnswerOutput {
  return {
    attemptId: fixtureAttempt1Id,
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
      .mockResolvedValue(ok(createSubmitOutput(fixtureChoice2Id)));
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoice2Id);

    await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
    expect(submitAnswerFn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: fixtureSession1Id,
        questionId: fixtureQ1Id,
        choiceId: fixtureChoice2Id,
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
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoice2Id);

    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe(fixtureChoice2Id);
    expect(submitAnswerFn).not.toHaveBeenCalled();
  });

  it('uses the loaded question mode to block exam click commits when sessionMode drifts', async () => {
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
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.setSessionMode('tutor');
    await expect.poll(() => harness.result.current.sessionMode).toBe('tutor');

    harness.result.current.onSelectChoice(fixtureChoice2Id);

    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe(fixtureChoice2Id);
    expect(submitAnswerFn).not.toHaveBeenCalled();
  });

  it('does not programmatically submit an exam choice before review finalization', async () => {
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(createSessionQuestion('exam')));
    const submitAnswerFn = vi
      .fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>()
      .mockResolvedValue(ok(createSubmitOutput(fixtureChoice2Id)));
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoice2Id);

    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe(fixtureChoice2Id);

    const result = await harness.result.current.onSubmit();

    expect(result).toBeNull();
    expect(submitAnswerFn).not.toHaveBeenCalled();
  });

  it('programmatically submits an exam choice when review finalization allows the commit', async () => {
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(createSessionQuestion('exam')));
    const submitAnswerFn = vi
      .fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>()
      .mockResolvedValue(ok(createSubmitOutput(fixtureChoice2Id)));
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoice2Id);
    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe(fixtureChoice2Id);

    const result = await harness.result.current.onSubmit({
      allowExamCommit: true,
    });

    expect(result).toEqual(createSubmitOutput(fixtureChoice2Id));
    expect(submitAnswerFn).toHaveBeenCalledTimes(1);
    expect(submitAnswerFn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: fixtureSession1Id,
        questionId: fixtureQ1Id,
        choiceId: fixtureChoice2Id,
      }),
    );
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
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoice1Id);
    harness.result.current.onSelectChoice(fixtureChoice2Id);

    await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe(fixtureChoice1Id);
    expect(submitAnswerFn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: fixtureSession1Id,
        questionId: fixtureQ1Id,
        choiceId: fixtureChoice1Id,
      }),
    );

    submitDeferred.resolve(ok(createSubmitOutput(fixtureChoice1Id)));
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
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoice1Id);

    await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
    await expect.poll(() => harness.result.current.isPending).toBe(true);

    harness.result.current.onSelectChoice(fixtureChoice2Id);

    submitDeferred.resolve(ok(createSubmitOutput(fixtureChoice1Id)));
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
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoice1Id);

    await harness.result.current.onSubmit();

    await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
    await expect.poll(() => harness.result.current.isPending).toBe(true);
    expect(submitAnswerFn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: fixtureSession1Id,
        questionId: fixtureQ1Id,
        choiceId: fixtureChoice1Id,
      }),
    );

    await harness.result.current.onSubmit();

    expect(submitAnswerFn).toHaveBeenCalledTimes(1);
    submitDeferred.resolve(ok(createSubmitOutput(fixtureChoice1Id)));
    await expect.poll(() => harness.result.current.isPending).toBe(false);
    expect(submitAnswerFn).toHaveBeenCalledTimes(1);
  });

  it('does not programmatically submit before a tutor choice is selected', async () => {
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(createSessionQuestion('tutor')));
    const submitAnswerFn = vi
      .fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>()
      .mockResolvedValue(ok(createSubmitOutput(fixtureChoice1Id)));
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);
    await expect.poll(() => harness.result.current.canSubmit).toBe(false);

    const result = await harness.result.current.onSubmit();

    expect(result).toBeNull();
    expect(submitAnswerFn).not.toHaveBeenCalled();
  });

  it('does not commit a tutor choice after submitResult locks the question', async () => {
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(createSessionQuestion('tutor')));
    const submitAnswerFn = vi
      .fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>()
      .mockResolvedValue(ok(createSubmitOutput(fixtureChoice1Id)));
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoice1Id);
    await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
    await expect
      .poll(() => harness.result.current.submitResult?.correctChoiceId ?? null)
      .toBe(fixtureChoice1Id);

    harness.result.current.onSelectChoice(fixtureChoice2Id);

    expect(submitAnswerFn).toHaveBeenCalledTimes(1);
  });

  it('does not programmatically resubmit after submitResult locks the tutor question', async () => {
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(createSessionQuestion('tutor')));
    const submitAnswerFn = vi
      .fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>()
      .mockResolvedValue(ok(createSubmitOutput(fixtureChoice1Id)));
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoice1Id);
    await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
    await expect
      .poll(() => harness.result.current.submitResult?.correctChoiceId ?? null)
      .toBe(fixtureChoice1Id);
    await expect.poll(() => harness.result.current.canSubmit).toBe(false);

    await harness.result.current.onSubmit();

    expect(submitAnswerFn).toHaveBeenCalledTimes(1);
  });

  it('surfaces submit errors and keeps session programmatic retry single-flight', async () => {
    const submitError = new Error('Session submit exploded');
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(createSessionQuestion('tutor')));
    const submitAnswerFn = vi
      .fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>()
      .mockRejectedValueOnce(submitError)
      .mockResolvedValueOnce(ok(createSubmitOutput(fixtureChoice2Id)));
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoice1Id);

    await expect
      .poll(() => harness.result.current.loadState.status)
      .toBe('error');
    await expect.poll(() => harness.result.current.isPending).toBe(false);

    const firstRetry = harness.result.current.onSubmit();
    const secondRetry = harness.result.current.onSubmit();

    await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(2);
    await expect(firstRetry).resolves.toEqual(
      createSubmitOutput(fixtureChoice2Id),
    );
    await expect(secondRetry).resolves.toBeNull();
    expect(submitAnswerFn).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId: fixtureSession1Id,
        questionId: fixtureQ1Id,
        choiceId: fixtureChoice1Id,
      }),
    );
  });
});
