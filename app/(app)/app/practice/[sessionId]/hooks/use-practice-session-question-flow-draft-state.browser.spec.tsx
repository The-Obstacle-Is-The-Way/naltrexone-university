import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SaveExamDraftAnswerOutput } from '@/src/adapters/controllers/practice-controller';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionQuestionFlow } from './use-practice-session-question-flow';

const fixtureSession1Id = crypto.randomUUID();
const fixtureQ2Id = crypto.randomUUID();
const fixtureQ1Id = crypto.randomUUID();
const fixtureChoice1Id = crypto.randomUUID();
const fixtureChoice2Id = crypto.randomUUID();
const fixtureSession2Id = crypto.randomUUID();

describe('usePracticeSessionQuestionFlow (browser)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
          request.questionId === fixtureQ1Id
        ) {
          return ok(
            createNextQuestion({
              questionId: fixtureQ1Id,
              choices: [
                { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
                { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
              ],
              session: {
                sessionId: fixtureSession1Id,
                mode: 'exam',

                deadlineAt: '2099-05-22T12:02:24.000Z',

                index: 0,
                total: 2,
                isMarkedForReview: false,
                draftSelectedChoiceId: fixtureChoice2Id,
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
              questionId: fixtureQ2Id,
              session: {
                sessionId: fixtureSession1Id,
                mode: 'exam',

                deadlineAt: '2099-05-22T12:02:24.000Z',

                index: 1,
                total: 2,
                isMarkedForReview: false,
              },
            }),
          );
        }

        return ok(
          createNextQuestion({
            questionId: fixtureQ1Id,
            choices: [
              { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
              { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
            ],
            session: {
              sessionId: fixtureSession1Id,
              mode: 'exam',

              deadlineAt: '2099-05-22T12:02:24.000Z',

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
              : fixtureQ1Id,
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
          draftSavedAt: '2026-02-01T00:00:00.000Z',
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

    harness.result.current.onSelectChoice(fixtureChoice2Id, 'pointer');
    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe(fixtureChoice2Id);

    nowMs = 31_000;
    harness.result.current.onNextQuestion();
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ2Id);

    nowMs = 31_500;
    harness.result.current.onNavigateQuestion(fixtureQ1Id);
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);
    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe(fixtureChoice2Id);

    nowMs = 51_500;
    harness.result.current.onNextQuestion();
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ2Id);

    expect(saveExamDraftAnswerFn).toHaveBeenNthCalledWith(1, {
      sessionId: fixtureSession1Id,
      questionId: fixtureQ1Id,
      selectedChoiceId: fixtureChoice2Id,
      cumulativeMs: 30_000,
    });
    expect(saveExamDraftAnswerFn).toHaveBeenNthCalledWith(2, {
      sessionId: fixtureSession1Id,
      questionId: fixtureQ2Id,
      selectedChoiceId: null,
      cumulativeMs: 500,
    });
    expect(saveExamDraftAnswerFn).toHaveBeenNthCalledWith(3, {
      sessionId: fixtureSession1Id,
      questionId: fixtureQ1Id,
      selectedChoiceId: fixtureChoice2Id,
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
          request.questionId === fixtureQ1Id
        ) {
          return ok(
            createNextQuestion({
              questionId: fixtureQ1Id,
              choices: [
                { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
                { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
              ],
              session: {
                sessionId: fixtureSession1Id,
                mode: 'exam',

                deadlineAt: '2099-05-22T12:02:24.000Z',

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
              questionId: fixtureQ2Id,
              session: {
                sessionId: fixtureSession1Id,
                mode: 'exam',

                deadlineAt: '2099-05-22T12:02:24.000Z',

                index: 1,
                total: 2,
                isMarkedForReview: false,
              },
            }),
          );
        }

        return ok(
          createNextQuestion({
            questionId: fixtureQ1Id,
            choices: [
              { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
              { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
            ],
            session: {
              sessionId: fixtureSession1Id,
              mode: 'exam',

              deadlineAt: '2099-05-22T12:02:24.000Z',

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
              : fixtureQ1Id,
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
          draftSavedAt: '2026-02-01T00:00:00.000Z',
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

    nowMs = 31_000;
    harness.result.current.onNextQuestion();
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ2Id);
    expect(saveExamDraftAnswerFn).toHaveBeenCalledTimes(1);
    expect(saveExamDraftAnswerFn).toHaveBeenCalledWith({
      sessionId: fixtureSession1Id,
      questionId: fixtureQ1Id,
      selectedChoiceId: null,
      cumulativeMs: 30_000,
    });

    nowMs = 31_500;
    harness.result.current.onNavigateQuestion(fixtureQ1Id);
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoice2Id, 'pointer');
    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe(fixtureChoice2Id);

    nowMs = 51_500;
    harness.result.current.onNextQuestion();
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ2Id);

    expect(saveExamDraftAnswerFn).toHaveBeenCalledTimes(3);
    expect(saveExamDraftAnswerFn).toHaveBeenNthCalledWith(2, {
      sessionId: fixtureSession1Id,
      questionId: fixtureQ2Id,
      selectedChoiceId: null,
      cumulativeMs: 500,
    });
    expect(saveExamDraftAnswerFn).toHaveBeenNthCalledWith(3, {
      sessionId: fixtureSession1Id,
      questionId: fixtureQ1Id,
      selectedChoiceId: fixtureChoice2Id,
      cumulativeMs: 50_000,
    });
  });

  it('clears local exam draft state when the sessionId changes', async () => {
    let nowMs = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockImplementation(async (request) => {
        if (
          typeof request === 'object' &&
          request &&
          'sessionId' in request &&
          request.sessionId === fixtureSession2Id
        ) {
          return ok(
            createNextQuestion({
              questionId: fixtureQ1Id,
              choices: [
                { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
                { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
              ],
              session: {
                sessionId: fixtureSession2Id,
                mode: 'exam',

                deadlineAt: '2099-05-22T12:02:24.000Z',

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
              questionId: fixtureQ2Id,
              session: {
                sessionId: fixtureSession1Id,
                mode: 'exam',

                deadlineAt: '2099-05-22T12:02:24.000Z',

                index: 1,
                total: 2,
                isMarkedForReview: false,
              },
            }),
          );
        }

        return ok(
          createNextQuestion({
            questionId: fixtureQ1Id,
            choices: [
              { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
              { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
            ],
            session: {
              sessionId: fixtureSession1Id,
              mode: 'exam',

              deadlineAt: '2099-05-22T12:02:24.000Z',

              index: 0,
              total: 2,
              isMarkedForReview: false,
              draftSelectedChoiceId: null,
              draftCumulativeMs: 0,
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
              : fixtureQ1Id,
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
              : fixtureChoice2Id,
          draftSavedAt: '2026-02-01T00:00:00.000Z',
          draftCumulativeMs:
            typeof input === 'object' &&
            input &&
            'cumulativeMs' in input &&
            typeof input.cumulativeMs === 'number'
              ? input.cumulativeMs
              : 0,
        }),
      );

    const harness = await renderHook(
      (props?: { sessionId: string }) =>
        usePracticeSessionQuestionFlow({
          sessionId: props?.sessionId ?? fixtureSession1Id,
          isMounted: () => true,
          getNextQuestionFn,
          submitAnswerFn,
          saveExamDraftAnswerFn,
        }),
      {
        initialProps: { sessionId: fixtureSession1Id },
      },
    );

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoice2Id, 'pointer');
    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe(fixtureChoice2Id);

    nowMs = 31_000;
    harness.result.current.onNextQuestion();
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ2Id);

    await harness.rerender({ sessionId: fixtureSession2Id });
    await expect
      .poll(() => harness.result.current.question?.session?.sessionId ?? null)
      .toBe(fixtureSession2Id);
    await expect.poll(() => harness.result.current.selectedChoiceId).toBeNull();

    // Session 1 saved this question at 30,000 ms; session 2 serves it with no
    // draft, so the next save must count only session 2's own elapsed time.
    const savesBeforeSessionTwoNavigation =
      saveExamDraftAnswerFn.mock.calls.length;
    nowMs = 32_000;
    harness.result.current.onNextQuestion();
    await expect
      .poll(() => saveExamDraftAnswerFn.mock.calls.length)
      .toBeGreaterThan(savesBeforeSessionTwoNavigation);
    expect(saveExamDraftAnswerFn).toHaveBeenLastCalledWith({
      sessionId: fixtureSession2Id,
      questionId: fixtureQ1Id,
      selectedChoiceId: null,
      cumulativeMs: 1_000,
    });
  });
});
