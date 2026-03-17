import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SaveExamDraftAnswerOutput } from '@/src/adapters/controllers/practice-controller';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionQuestionFlow } from './use-practice-session-question-flow';

describe('usePracticeSessionQuestionFlow (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call getNextQuestionFn on mount when autoload is false', async () => {
    const getNextQuestionFn = vi.fn<
      (input: unknown) => Promise<ActionResult<NextQuestion | null>>
    >(async () => {
      throw new Error(
        'getNextQuestionFn should not run when autoload is false',
      );
    });
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        autoload: false,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect.poll(() => getNextQuestionFn.mock.calls.length).toBe(0);
  });

  it('calls getNextQuestionFn on mount when autoload is omitted', async () => {
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(null));
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    await expect.poll(() => getNextQuestionFn.mock.calls.length).toBe(1);
  });

  it('returns null sessionInfo after resetQuestionState clears stale session metadata', async () => {
    const getNextQuestionFn =
      vi.fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>();
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        autoload: false,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    harness.result.current.applySessionInfo({
      sessionId: 'session-1',
      mode: 'tutor',
      index: 0,
      total: 2,
      isMarkedForReview: false,
    });

    await expect
      .poll(() => harness.result.current.sessionInfo?.sessionId ?? null)
      .toBe('session-1');

    harness.result.current.resetQuestionState();

    await expect.poll(() => harness.result.current.sessionInfo).toBeNull();
  });

  it('saves the current exam draft before navigating to the next question', async () => {
    const callOrder: string[] = [];
    let nowMs = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockImplementation(async (request) => {
        callOrder.push('load');

        if (
          typeof request === 'object' &&
          request &&
          'fromIndex' in request &&
          request.fromIndex === 0
        ) {
          return ok(
            createNextQuestion({
              questionId: 'q_2',
              session: {
                sessionId: 'session-1',
                mode: 'exam',
                index: 1,
                total: 2,
                isMarkedForReview: false,
              },
            }),
          );
        }

        return ok(
          createNextQuestion({
            questionId: 'q_1',
            choices: [
              { id: 'choice_1', label: 'A', textMd: 'A', sortOrder: 1 },
              { id: 'choice_2', label: 'B', textMd: 'B', sortOrder: 2 },
            ],
            session: {
              sessionId: 'session-1',
              mode: 'exam',
              index: 0,
              total: 2,
              isMarkedForReview: false,
            },
          }),
        );
      });
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockImplementation(async () => {
        callOrder.push('save');
        return ok({
          questionId: 'q_1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: 'choice_2',
          draftSavedAt: new Date('2026-02-01T00:00:00.000Z'),
          draftCumulativeMs: 30_000,
        });
      });

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
    nowMs = 31_000;
    harness.result.current.onNextQuestion();

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_2');
    expect(callOrder).toEqual(['load', 'save', 'load']);
    expect(saveExamDraftAnswerFn).toHaveBeenCalledWith({
      sessionId: 'session-1',
      questionId: 'q_1',
      selectedChoiceId: 'choice_2',
      cumulativeMs: 30_000,
    });
  });

  it('navigates without saving when exam next is used with no selection', async () => {
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValueOnce(
        ok(
          createNextQuestion({
            questionId: 'q_1',
            session: {
              sessionId: 'session-1',
              mode: 'exam',
              index: 0,
              total: 2,
              isMarkedForReview: false,
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        ok(
          createNextQuestion({
            questionId: 'q_2',
            session: {
              sessionId: 'session-1',
              mode: 'exam',
              index: 1,
              total: 2,
              isMarkedForReview: false,
            },
          }),
        ),
      );
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

    harness.result.current.onNextQuestion();

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_2');
    expect(saveExamDraftAnswerFn).not.toHaveBeenCalled();
  });

  it('accumulates exam draft time across revisits', async () => {
    let nowMs = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockImplementation(async (request) => {
        if (
          typeof request === 'object' &&
          request &&
          'questionId' in request &&
          request.questionId === 'q_1'
        ) {
          return ok(
            createNextQuestion({
              questionId: 'q_1',
              choices: [
                { id: 'choice_1', label: 'A', textMd: 'A', sortOrder: 1 },
                { id: 'choice_2', label: 'B', textMd: 'B', sortOrder: 2 },
              ],
              session: {
                sessionId: 'session-1',
                mode: 'exam',
                index: 0,
                total: 2,
                isMarkedForReview: false,
                draftSelectedChoiceId: 'choice_2',
                draftCumulativeMs: 30_000,
              },
            }),
          );
        }

        if (
          typeof request === 'object' &&
          request &&
          'fromIndex' in request &&
          request.fromIndex === 0
        ) {
          return ok(
            createNextQuestion({
              questionId: 'q_2',
              session: {
                sessionId: 'session-1',
                mode: 'exam',
                index: 1,
                total: 2,
                isMarkedForReview: false,
              },
            }),
          );
        }

        return ok(
          createNextQuestion({
            questionId: 'q_1',
            choices: [
              { id: 'choice_1', label: 'A', textMd: 'A', sortOrder: 1 },
              { id: 'choice_2', label: 'B', textMd: 'B', sortOrder: 2 },
            ],
            session: {
              sessionId: 'session-1',
              mode: 'exam',
              index: 0,
              total: 2,
              isMarkedForReview: false,
            },
          }),
        );
      });
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockImplementation(async (input) =>
        ok({
          questionId:
            typeof input === 'object' &&
            input &&
            'questionId' in input &&
            typeof input.questionId === 'string'
              ? input.questionId
              : 'q_1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId:
            typeof input === 'object' &&
            input &&
            'selectedChoiceId' in input &&
            typeof input.selectedChoiceId === 'string'
              ? input.selectedChoiceId
              : 'choice_2',
          draftSavedAt: new Date('2026-02-01T00:00:00.000Z'),
          draftCumulativeMs:
            typeof input === 'object' &&
            input &&
            'cumulativeMs' in input &&
            typeof input.cumulativeMs === 'number'
              ? input.cumulativeMs
              : 0,
        }),
      );

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

    nowMs = 31_000;
    harness.result.current.onNextQuestion();
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_2');

    nowMs = 31_500;
    harness.result.current.onNavigateQuestion('q_1');
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_1');
    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe('choice_2');

    nowMs = 51_500;
    harness.result.current.onNextQuestion();
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_2');

    expect(saveExamDraftAnswerFn).toHaveBeenNthCalledWith(1, {
      sessionId: 'session-1',
      questionId: 'q_1',
      selectedChoiceId: 'choice_2',
      cumulativeMs: 30_000,
    });
    expect(saveExamDraftAnswerFn).toHaveBeenNthCalledWith(2, {
      sessionId: 'session-1',
      questionId: 'q_1',
      selectedChoiceId: 'choice_2',
      cumulativeMs: 50_000,
    });
  });

  it('carries unanswered exam time across revisits before a later answer is saved', async () => {
    let nowMs = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockImplementation(async (request) => {
        if (
          typeof request === 'object' &&
          request &&
          'questionId' in request &&
          request.questionId === 'q_1'
        ) {
          return ok(
            createNextQuestion({
              questionId: 'q_1',
              choices: [
                { id: 'choice_1', label: 'A', textMd: 'A', sortOrder: 1 },
                { id: 'choice_2', label: 'B', textMd: 'B', sortOrder: 2 },
              ],
              session: {
                sessionId: 'session-1',
                mode: 'exam',
                index: 0,
                total: 2,
                isMarkedForReview: false,
                draftSelectedChoiceId: null,
                draftCumulativeMs: 0,
              },
            }),
          );
        }

        if (
          typeof request === 'object' &&
          request &&
          'fromIndex' in request &&
          request.fromIndex === 0
        ) {
          return ok(
            createNextQuestion({
              questionId: 'q_2',
              session: {
                sessionId: 'session-1',
                mode: 'exam',
                index: 1,
                total: 2,
                isMarkedForReview: false,
              },
            }),
          );
        }

        return ok(
          createNextQuestion({
            questionId: 'q_1',
            choices: [
              { id: 'choice_1', label: 'A', textMd: 'A', sortOrder: 1 },
              { id: 'choice_2', label: 'B', textMd: 'B', sortOrder: 2 },
            ],
            session: {
              sessionId: 'session-1',
              mode: 'exam',
              index: 0,
              total: 2,
              isMarkedForReview: false,
            },
          }),
        );
      });
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockImplementation(async (input) =>
        ok({
          questionId:
            typeof input === 'object' &&
            input &&
            'questionId' in input &&
            typeof input.questionId === 'string'
              ? input.questionId
              : 'q_1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId:
            typeof input === 'object' &&
            input &&
            'selectedChoiceId' in input &&
            typeof input.selectedChoiceId === 'string'
              ? input.selectedChoiceId
              : null,
          draftSavedAt: new Date('2026-02-01T00:00:00.000Z'),
          draftCumulativeMs:
            typeof input === 'object' &&
            input &&
            'cumulativeMs' in input &&
            typeof input.cumulativeMs === 'number'
              ? input.cumulativeMs
              : 0,
        }),
      );

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

    nowMs = 31_000;
    harness.result.current.onNextQuestion();
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_2');
    expect(saveExamDraftAnswerFn).not.toHaveBeenCalled();

    nowMs = 31_500;
    harness.result.current.onNavigateQuestion('q_1');
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_1');

    harness.result.current.onSelectChoice('choice_2');
    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe('choice_2');

    nowMs = 51_500;
    harness.result.current.onNextQuestion();
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe('q_2');

    expect(saveExamDraftAnswerFn).toHaveBeenCalledTimes(1);
    expect(saveExamDraftAnswerFn).toHaveBeenCalledWith({
      sessionId: 'session-1',
      questionId: 'q_1',
      selectedChoiceId: 'choice_2',
      cumulativeMs: 50_000,
    });
  });
});
