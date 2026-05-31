import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  FinalizeExamAnswersOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
  GetPracticeSessionReviewOutput,
  GetPracticeSessionSummaryOutput,
} from '@/src/adapters/controllers/practice-controller';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';

import {
  type UsePracticeSessionReviewStageInput,
  usePracticeSessionReviewStage,
} from './use-practice-session-review-stage';

const fixtureSession1Id = crypto.randomUUID();
const fixtureQ1Id = crypto.randomUUID();
const fixtureQ2Id = crypto.randomUUID();

const endPracticeSessionMock =
  vi.fn<(input: unknown) => Promise<ActionResult<EndPracticeSessionOutput>>>();
const finalizeExamAnswersMock =
  vi.fn<(input: unknown) => Promise<ActionResult<FinalizeExamAnswersOutput>>>();
const getPracticeSessionReviewMock =
  vi.fn<
    (input: unknown) => Promise<ActionResult<GetPracticeSessionReviewOutput>>
  >();
const getPracticeSessionSummaryMock =
  vi.fn<
    (input: unknown) => Promise<ActionResult<GetPracticeSessionSummaryOutput>>
  >();
const getCompletedSessionQuestionsWithFeedbackMock =
  vi.fn<
    (
      input: unknown,
    ) => Promise<ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>>
  >();
const saveCurrentExamDraftMock = vi.fn<() => Promise<boolean>>();

function createInput(sessionMode: 'tutor' | 'exam') {
  return {
    sessionId: fixtureSession1Id,
    isMounted: () => true,
    sessionInfo: null as UsePracticeSessionReviewStageInput['sessionInfo'],
    questionId: null,
    submitResult: null,
    sessionMode,
    setSessionMode: vi.fn(),
    setLoadState: vi.fn(),
    resetQuestionState: vi.fn(),
    loadSpecificQuestion: vi.fn(),
    endPracticeSessionFn: endPracticeSessionMock,
    finalizeExamAnswersFn: finalizeExamAnswersMock,
    getPracticeSessionReviewFn: getPracticeSessionReviewMock,
    getPracticeSessionSummaryFn: getPracticeSessionSummaryMock,
    getCompletedSessionQuestionsWithFeedbackFn:
      getCompletedSessionQuestionsWithFeedbackMock,
    saveCurrentExamDraft: saveCurrentExamDraftMock,
  };
}

function createPostExamReviewRow(input: {
  questionId: string;
  order?: number;
  isAvailable?: boolean;
}): GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number] {
  if (input.isAvailable === false) {
    return {
      isAvailable: false,
      questionId: input.questionId,
      order: input.order ?? 1,
      isAnswered: true,
      isCorrect: false,
      isOmitted: false,
      markedForReview: false,
    };
  }

  return {
    isAvailable: true,
    questionId: input.questionId,
    slug: `${input.questionId}-slug`,
    stemMd: `Stem for ${input.questionId}`,
    difficulty: 'easy',
    order: input.order ?? 1,
    isAnswered: true,
    isCorrect: true,
    isOmitted: false,
    markedForReview: false,
    choices: [
      { id: `${input.questionId}-choice-1`, label: 'A', textMd: 'Choice A' },
    ],
    selectedChoiceId: `${input.questionId}-choice-1`,
    correctChoiceId: `${input.questionId}-choice-1`,
    explanationMd: `Explanation for ${input.questionId}`,
    referenceMd: null,
    choiceExplanations: [],
  };
}

function createPostExamReview(
  ...rows: Array<
    string | GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number]
  >
): GetCompletedSessionQuestionsWithFeedbackOutput {
  const reviewRows =
    rows.length > 0
      ? rows.map((row, index) =>
          typeof row === 'string'
            ? createPostExamReviewRow({
                questionId: row,
                order: index + 1,
              })
            : row,
        )
      : [createPostExamReviewRow({ questionId: fixtureQ1Id })];

  return {
    sessionId: fixtureSession1Id,
    mode: 'exam',
    totalCount: reviewRows.length,
    answeredCount: reviewRows.filter((row) => row.isAnswered).length,
    markedCount: reviewRows.filter((row) => row.markedForReview).length,
    rows: reviewRows,
  };
}

async function flushDeferredSettlement(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('usePracticeSessionReviewStage (browser)', () => {
  beforeEach(() => {
    saveCurrentExamDraftMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    endPracticeSessionMock.mockReset();
    finalizeExamAnswersMock.mockReset();
    getPracticeSessionReviewMock.mockReset();
    getPracticeSessionSummaryMock.mockReset();
    getCompletedSessionQuestionsWithFeedbackMock.mockReset();
    saveCurrentExamDraftMock.mockReset();
  });

  it('finalizes tutor sessions and loads summary review data', async () => {
    endPracticeSessionMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'tutor',
        questionCount: 10,
        totals: {
          answered: 10,
          correct: 8,
          accuracy: 0.8,
          durationSeconds: 1200,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'tutor',
        totalCount: 10,
        answeredCount: 10,
        markedCount: 0,
        rows: [],
      }),
    );

    const input = createInput('tutor');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => harness.result.current.summary?.sessionId ?? null)
      .toBe(fixtureSession1Id);
    await expect
      .poll(() => harness.result.current.summaryReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.summaryReview?.sessionId).toBe(
      fixtureSession1Id,
    );
  });

  it('sets review load error when exam review loading throws', async () => {
    getPracticeSessionReviewMock.mockRejectedValue(
      new Error('Review load failed'),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => harness.result.current.reviewLoadState.status)
      .toBe('error');
    expect(harness.result.current.reviewLoadState).toEqual({
      status: 'error',
      message: 'Review load failed',
    });
  });

  it('sets navigator error state and retries navigator fetch when requested', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    getPracticeSessionReviewMock.mockRejectedValueOnce(
      new Error('Navigator load failed'),
    );
    getPracticeSessionReviewMock.mockResolvedValueOnce(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: fixtureQ1Id,
            slug: 'q-1',
            stemMd: 'Stem 1',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
          {
            isAvailable: true,
            questionId: fixtureQ2Id,
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'medium',
            order: 2,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }),
    );

    const input = createInput('exam');
    input.sessionInfo = {
      sessionId: fixtureSession1Id,
      mode: 'exam',

      deadlineAt: '2099-05-22T12:02:24.000Z',

      index: 0,
      total: 2,
      isMarkedForReview: false,
    };

    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await expect
      .poll(() => harness.result.current.navigatorLoadState.status)
      .toBe('error');
    expect(harness.result.current.navigatorLoadState).toEqual({
      status: 'error',
      message: 'Navigator load failed',
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(harness.result.current.navigator).toBeNull();

    harness.result.current.onRetryNavigator();

    await expect
      .poll(() => harness.result.current.navigatorLoadState.status)
      .toBe('ready');
    expect(harness.result.current.navigator?.sessionId).toBe(fixtureSession1Id);
  });

  it('finalizes exam review via finalizeExamAnswers instead of endPracticeSession', async () => {
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [],
      }),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.summary).toBeNull();
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
    expect(endPracticeSessionMock).not.toHaveBeenCalled();
  });

  it('enters post-exam review after finalizing an exam instead of showing summary immediately', async () => {
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: fixtureQ1Id,
            slug: 'q-1',
            stemMd: 'Stem 1',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
            markedForReview: false,
            choices: [
              { id: 'c1', label: 'A', textMd: 'Choice A' },
              { id: 'c2', label: 'B', textMd: 'Choice B' },
            ],
            selectedChoiceId: 'c1',
            correctChoiceId: 'c2',
            explanationMd: 'Because B is correct.',
            referenceMd: 'Reference 1',
            choiceExplanations: [],
          },
          {
            isAvailable: true,
            questionId: fixtureQ2Id,
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'medium',
            order: 2,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
            choices: [{ id: 'c3', label: 'A', textMd: 'Choice A' }],
            selectedChoiceId: 'c3',
            correctChoiceId: 'c3',
            explanationMd: 'Because A is correct.',
            referenceMd: null,
            choiceExplanations: [],
          },
        ],
      }),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.summary).toBeNull();
    expect(harness.result.current.postExamReview?.sessionId).toBe(
      fixtureSession1Id,
    );
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      fixtureQ1Id,
    );
  });

  it('switches to session summary without clearing completed feedback or the current reviewed question', async () => {
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 1,
        totals: {
          answered: 1,
          correct: 1,
          accuracy: 1,
          durationSeconds: 60,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockResolvedValue(
      ok(
        createPostExamReview(
          createPostExamReviewRow({ questionId: fixtureQ1Id, order: 1 }),
          createPostExamReviewRow({ questionId: fixtureQ2Id, order: 2 }),
        ),
      ),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    harness.result.current.onNavigatePostExamReviewQuestion(fixtureQ2Id);

    harness.result.current.onViewSummary();

    await expect
      .poll(() => harness.result.current.summary?.sessionId ?? null)
      .toBe(fixtureSession1Id);
    await expect
      .poll(() => harness.result.current.summaryReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.examResultsSubstage).toBe('session_summary');
    expect(harness.result.current.postExamReview?.sessionId).toBe(
      fixtureSession1Id,
    );
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      fixtureQ2Id,
    );
  });

  it('re-enters post-exam review without a question id at the first available row instead of the current reviewed question', async () => {
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockResolvedValue(
      ok(
        createPostExamReview(
          createPostExamReviewRow({ questionId: fixtureQ1Id, order: 1 }),
          createPostExamReviewRow({ questionId: fixtureQ2Id, order: 2 }),
        ),
      ),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    harness.result.current.onNavigatePostExamReviewQuestion(fixtureQ2Id);
    harness.result.current.onViewSummary();

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview();

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('post_exam_review');
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      fixtureQ1Id,
    );
    expect(getCompletedSessionQuestionsWithFeedbackMock).toHaveBeenCalledTimes(
      1,
    );
  });

  it('re-enters post-exam review on the specifically requested summary question', async () => {
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockResolvedValue(
      ok(
        createPostExamReview(
          createPostExamReviewRow({ questionId: fixtureQ1Id, order: 1 }),
          createPostExamReviewRow({ questionId: fixtureQ2Id, order: 2 }),
        ),
      ),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    harness.result.current.onViewSummary();

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview(fixtureQ2Id);

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('post_exam_review');
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      fixtureQ2Id,
    );
  });

  it('falls back to the first available reviewed question on untargeted re-entry when the current cursor points at an unavailable row', async () => {
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockResolvedValue(
      ok(
        createPostExamReview(
          createPostExamReviewRow({
            questionId: fixtureQ1Id,
            order: 1,
            isAvailable: false,
          }),
          createPostExamReviewRow({ questionId: fixtureQ2Id, order: 2 }),
        ),
      ),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    harness.result.current.onNavigatePostExamReviewQuestion(fixtureQ1Id);
    harness.result.current.onViewSummary();

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview();

    await expect
      .poll(() => harness.result.current.postExamReviewCurrentQuestionId)
      .toBe(fixtureQ2Id);
  });

  it('lazy-hydrates completed feedback to the first available row when summary re-entry has no preserved post-exam review payload', async () => {
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockResolvedValue(
      ok(
        createPostExamReview(
          createPostExamReviewRow({
            questionId: fixtureQ1Id,
            order: 1,
            isAvailable: false,
          }),
          createPostExamReviewRow({ questionId: fixtureQ2Id, order: 2 }),
        ),
      ),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.setSummary({
      sessionId: fixtureSession1Id,
      endedAt: '2026-02-07T00:20:00.000Z',
      mode: 'exam',
      questionCount: 2,
      totals: {
        answered: 2,
        correct: 1,
        accuracy: 0.5,
        durationSeconds: 120,
      },
    });

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    expect(getCompletedSessionQuestionsWithFeedbackMock).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      fixtureQ2Id,
    );
    expect(harness.result.current.examResultsSubstage).toBe('post_exam_review');
  });

  it('does not start a duplicate post-exam review load while summary re-entry hydration is already in flight', async () => {
    const reviewLoad =
      createDeferred<
        ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>
      >();
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockImplementation(
      async () => reviewLoad.promise,
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.setSummary({
      sessionId: fixtureSession1Id,
      endedAt: '2026-02-07T00:20:00.000Z',
      mode: 'exam',
      questionCount: 2,
      totals: {
        answered: 2,
        correct: 1,
        accuracy: 0.5,
        durationSeconds: 120,
      },
    });

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview();
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('loading');
    expect(getCompletedSessionQuestionsWithFeedbackMock).toHaveBeenCalledTimes(
      1,
    );

    harness.result.current.onReenterPostExamReview();
    expect(getCompletedSessionQuestionsWithFeedbackMock).toHaveBeenCalledTimes(
      1,
    );

    reviewLoad.resolve(ok(createPostExamReview(fixtureQ2Id)));
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
  });

  it('preserves the deferred exam summary when post-exam review loading fails so retry and summary recovery still work', async () => {
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 1,
        totals: {
          answered: 1,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock
      .mockRejectedValueOnce(new Error('Review fetch failed'))
      .mockResolvedValueOnce(
        ok({
          sessionId: fixtureSession1Id,
          mode: 'exam',
          totalCount: 1,
          answeredCount: 1,
          markedCount: 0,
          rows: [
            {
              isAvailable: true,
              questionId: fixtureQ1Id,
              slug: 'q-1',
              stemMd: 'Stem 1',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: false,
              isOmitted: false,
              markedForReview: false,
              choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
              selectedChoiceId: 'c1',
              correctChoiceId: 'c2',
              explanationMd: 'Because B is correct.',
              referenceMd: null,
              choiceExplanations: [],
            },
          ],
        }),
      );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('error');
    expect(harness.result.current.postExamSummary?.sessionId).toBe(
      fixtureSession1Id,
    );

    harness.result.current.onRetryPostExamReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.postExamReview?.sessionId).toBe(
      fixtureSession1Id,
    );

    harness.result.current.onViewSummary();

    await expect
      .poll(() => harness.result.current.summary?.sessionId ?? null)
      .toBe(fixtureSession1Id);
  });

  it("keeps retry request B's success when stale retry request A rejects afterward", async () => {
    const retryA =
      createDeferred<
        ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>
      >();
    const retryB =
      createDeferred<
        ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>
      >();
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 1,
        totals: {
          answered: 1,
          correct: 1,
          accuracy: 1,
          durationSeconds: 60,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock
      .mockRejectedValueOnce(new Error('Initial review fetch failed'))
      .mockImplementationOnce(async () => retryA.promise)
      .mockImplementationOnce(async () => retryB.promise);

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('error');

    harness.result.current.onRetryPostExamReview();
    harness.result.current.onRetryPostExamReview();

    await expect
      .poll(
        () => getCompletedSessionQuestionsWithFeedbackMock.mock.calls.length,
      )
      .toBe(3);

    retryB.resolve(ok(createPostExamReview('question-b')));
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState)
      .toEqual({ status: 'ready' });
    expect(harness.result.current.postExamReview?.rows[0]?.questionId).toBe(
      'question-b',
    );
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      'question-b',
    );

    retryA.reject(new Error('Stale retry failed'));
    await flushDeferredSettlement();

    expect(harness.result.current.postExamReviewLoadState).toEqual({
      status: 'ready',
    });
    expect(harness.result.current.postExamReview?.rows[0]?.questionId).toBe(
      'question-b',
    );
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      'question-b',
    );
  });

  it("preserves retry request B's error when stale retry request A succeeds afterward", async () => {
    const retryA =
      createDeferred<
        ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>
      >();
    const retryB =
      createDeferred<
        ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>
      >();
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 1,
        totals: {
          answered: 1,
          correct: 1,
          accuracy: 1,
          durationSeconds: 60,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock
      .mockRejectedValueOnce(new Error('Initial review fetch failed'))
      .mockImplementationOnce(async () => retryA.promise)
      .mockImplementationOnce(async () => retryB.promise);

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('error');

    harness.result.current.onRetryPostExamReview();
    harness.result.current.onRetryPostExamReview();

    await expect
      .poll(
        () => getCompletedSessionQuestionsWithFeedbackMock.mock.calls.length,
      )
      .toBe(3);

    retryB.reject(new Error('Latest retry failed'));
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState)
      .toEqual({ status: 'error', message: 'Latest retry failed' });
    expect(harness.result.current.postExamReview).toBeNull();
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBeNull();

    retryA.resolve(ok(createPostExamReview('question-a')));
    await flushDeferredSettlement();

    expect(harness.result.current.postExamReviewLoadState).toEqual({
      status: 'error',
      message: 'Latest retry failed',
    });
    expect(harness.result.current.postExamReview).toBeNull();
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBeNull();
  });

  it('saves the current exam draft before entering review stage', async () => {
    const callOrder: string[] = [];
    saveCurrentExamDraftMock.mockImplementation(async () => {
      callOrder.push('save');
      return true;
    });
    getPracticeSessionReviewMock.mockImplementation(async () => {
      callOrder.push('review');
      return ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      });
    });

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => harness.result.current.reviewLoadState.status)
      .toBe('ready');
    expect(callOrder).toEqual(['save', 'review']);
  });

  it('reports draft-save exceptions and does not enter the review stage', async () => {
    saveCurrentExamDraftMock.mockRejectedValue(new Error('Draft save failed'));

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.onEndSession();

    await expect.poll(() => saveCurrentExamDraftMock.mock.calls.length).toBe(1);
    expect(getPracticeSessionReviewMock).not.toHaveBeenCalled();
    await expect.poll(() => harness.result.current.isInReviewStage).toBe(false);
    expect(harness.result.current.reviewLoadState).toEqual({ status: 'idle' });
  });
});
