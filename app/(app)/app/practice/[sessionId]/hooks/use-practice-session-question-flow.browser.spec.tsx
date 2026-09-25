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
        sessionId: fixtureSession1Id,
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
        sessionId: fixtureSession1Id,
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
        sessionId: fixtureSession1Id,
        autoload: false,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
      }),
    );

    harness.result.current.applySessionInfo({
      sessionId: fixtureSession1Id,
      mode: 'tutor',

      deadlineAt: null,

      index: 0,
      total: 2,
      isMarkedForReview: false,
    });

    await expect
      .poll(() => harness.result.current.sessionInfo?.sessionId ?? null)
      .toBe(fixtureSession1Id);

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
      .mockImplementation(async () => {
        callOrder.push('save');
        return ok({
          questionId: fixtureQ1Id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: fixtureChoice2Id,
          draftSavedAt: '2026-02-01T00:00:00.000Z',
          draftCumulativeMs: 30_000,
        });
      });

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
    expect(callOrder).toEqual(['load', 'save', 'load']);
    expect(saveExamDraftAnswerFn).toHaveBeenCalledWith({
      sessionId: fixtureSession1Id,
      questionId: fixtureQ1Id,
      selectedChoiceId: fixtureChoice2Id,
      cumulativeMs: 30_000,
    });
  });

  it('stops after a server-expired draft save when no expiry handler is registered', async () => {
    let nowMs = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValueOnce(
        ok(
          createNextQuestion({
            questionId: fixtureQ1Id,
            session: {
              sessionId: fixtureSession1Id,
              mode: 'exam',

              deadlineAt: '2099-05-22T12:02:24.000Z',

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
        ),
      );
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Exam time has expired',
          details: { reason: 'exam_time_expired' },
        },
      } as ActionResult<SaveExamDraftAnswerOutput>);

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

    await expect.poll(() => saveExamDraftAnswerFn.mock.calls.length).toBe(1);
    expect(getNextQuestionFn).toHaveBeenCalledTimes(1);
    expect(harness.result.current.question?.questionId).toBe(fixtureQ1Id);
  });

  it('recovers a server-expired draft save during explicit navigation when a handler is registered', async () => {
    let nowMs = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(
        ok(
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
        ),
      );
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Exam time has expired',
          details: { reason: 'exam_time_expired' },
        },
      } as ActionResult<SaveExamDraftAnswerOutput>);
    const onExamServerExpiry = vi.fn<(draft: unknown) => Promise<void>>(
      async () => {},
    );

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
        onExamServerExpiry,
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
    harness.result.current.onNavigateQuestion(fixtureQ2Id);

    await expect.poll(() => onExamServerExpiry.mock.calls.length).toBe(1);
    expect(onExamServerExpiry).toHaveBeenCalledWith({
      questionId: fixtureQ1Id,
      selectedChoiceId: fixtureChoice2Id,
      cumulativeMs: 30_000,
    });
    expect(getNextQuestionFn).toHaveBeenCalledTimes(1);
    expect(harness.result.current.question?.questionId).toBe(fixtureQ1Id);
  });

  it('does not recover server expiry when explicit navigation draft save fails with a transient state-write conflict', async () => {
    let nowMs = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(
        ok(
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
        ),
      );
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Practice session state changed concurrently; please retry.',
          details: { reason: 'practice_session_state_changed_concurrently' },
        },
      } as ActionResult<SaveExamDraftAnswerOutput>);
    const onExamServerExpiry = vi.fn<(draft: unknown) => Promise<void>>(
      async () => {},
    );

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
        onExamServerExpiry,
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
    harness.result.current.onNavigateQuestion(fixtureQ2Id);

    await expect.poll(() => saveExamDraftAnswerFn.mock.calls.length).toBe(1);
    expect(onExamServerExpiry).not.toHaveBeenCalled();
    expect(getNextQuestionFn).toHaveBeenCalledTimes(1);
    expect(harness.result.current.question?.questionId).toBe(fixtureQ1Id);
  });

  it('does not recover or navigate when explicit navigation draft save fails without a conflict', async () => {
    let nowMs = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(
        ok(
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
        ),
      );
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Draft save failed' },
      });
    const onExamServerExpiry = vi.fn<(draft: unknown) => Promise<void>>(
      async () => {},
    );

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
        saveExamDraftAnswerFn,
        onExamServerExpiry,
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
    harness.result.current.onNavigateQuestion(fixtureQ2Id);

    await expect.poll(() => saveExamDraftAnswerFn.mock.calls.length).toBe(1);
    expect(onExamServerExpiry).not.toHaveBeenCalled();
    expect(getNextQuestionFn).toHaveBeenCalledTimes(1);
    expect(harness.result.current.question?.questionId).toBe(fixtureQ1Id);
  });

  it('falls back to the server draft when the session draft cache is cleared before saving', async () => {
    let nowMs = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(
        ok(
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
              draftSelectedChoiceId: fixtureChoice1Id,
              draftCumulativeMs: 12_000,
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

    const harness = await renderHook(
      (
        props: { sessionId: string; autoload: boolean } = {
          sessionId: fixtureSession1Id,
          autoload: true,
        },
      ) =>
        usePracticeSessionQuestionFlow({
          sessionId: props.sessionId,
          autoload: props.autoload,
          isMounted: () => true,
          getNextQuestionFn,
          submitAnswerFn,
          saveExamDraftAnswerFn,
        }),
      {
        initialProps: { sessionId: fixtureSession1Id, autoload: true },
      },
    );

    await expect
      .poll(() => harness.result.current.selectedChoiceId)
      .toBe(fixtureChoice1Id);

    await harness.rerender({
      sessionId: fixtureSession2Id,
      autoload: false,
    });
    nowMs = 31_000;
    await expect(
      harness.result.current.saveCurrentExamDraft(),
    ).resolves.toEqual({ ok: true });

    expect(saveExamDraftAnswerFn).not.toHaveBeenCalled();
  });

  it('navigates without saving when exam next is used with no selection and no elapsed time', async () => {
    vi.spyOn(Date, 'now').mockImplementation(() => 1_000);
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValueOnce(
        ok(
          createNextQuestion({
            questionId: fixtureQ1Id,
            session: {
              sessionId: fixtureSession1Id,
              mode: 'exam',

              deadlineAt: '2099-05-22T12:02:24.000Z',

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

    harness.result.current.onNextQuestion();

    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ2Id);
    expect(saveExamDraftAnswerFn).not.toHaveBeenCalled();
  });
});
