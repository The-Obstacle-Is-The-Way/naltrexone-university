import { afterEach, beforeAll, beforeEach, expect } from 'vitest';
import type { render } from 'vitest-browser-react';
import type {
  ActionErrorCode,
  ActionResult,
} from '@/src/adapters/controllers/action-result';
import { ok } from '@/tests/test-helpers/ok';
import {
  BROWSER_CHOICE_1_ID,
  BROWSER_CHOICE_2_ID,
  BROWSER_CHOICE_3_ID,
  BROWSER_QUESTION_1_ID,
  BROWSER_QUESTION_2_ID,
  BROWSER_QUESTION_3_ID,
  createChoice,
  createQuestionResponse,
  createReviewResponse,
  createReviewRow,
} from './practice-session-page-controller.browser.fixtures';
import {
  getPracticeSessionPageControllerBrowserMocks,
  resetPracticeSessionPageControllerBrowserMocks,
} from './practice-session-page-controller.browser.setup';

export let PracticeSessionPageControllerBookmarkPendingProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerBookmarkPendingProbe;
export let PracticeSessionPageControllerBookmarkProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerBookmarkProbe;
export let PracticeSessionPageControllerHookProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerHookProbe;
export let PracticeSessionPageControllerMarkForReviewProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerMarkForReviewProbe;
export let PracticeSessionPageControllerNavigationProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerNavigationProbe;
export let PracticeSessionPageControllerReviewProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerReviewProbe;
export let PracticeSessionPageControllerSummaryProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerSummaryProbe;
export let PracticeSessionPageControllerSubmitDuringReviewProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerSubmitDuringReviewProbe;
export let PracticeSessionPageControllerViewProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerViewProbe;

export const {
  getNextQuestionMock,
  submitAnswerMock,
  getBookmarksMock,
  toggleBookmarkMock,
  getPracticeSessionReviewMock,
  getCompletedSessionQuestionsWithFeedbackMock,
  getPracticeSessionSummaryMock,
  endPracticeSessionMock,
  finalizeExamAnswersMock,
  saveExamDraftAnswerMock,
  setPracticeSessionQuestionMarkMock,
} = getPracticeSessionPageControllerBrowserMocks();

export const EMPTY_BOOKMARKS_RESULT = ok({ rows: [] });
export const CHOICE_1 = createChoice({ id: BROWSER_CHOICE_1_ID });
export const CHOICE_2 = createChoice({
  id: BROWSER_CHOICE_2_ID,
  label: 'B',
  textMd: 'Option B',
  sortOrder: 2,
});
export const CHOICE_3 = createChoice({
  id: BROWSER_CHOICE_3_ID,
  label: 'C',
  textMd: 'Option C',
  sortOrder: 3,
});

export {
  BROWSER_ATTEMPT_1_ID,
  BROWSER_CHOICE_1_ID,
  BROWSER_CHOICE_2_ID,
  BROWSER_CHOICE_3_ID,
  BROWSER_QUESTION_1_ID,
  BROWSER_QUESTION_2_ID,
  BROWSER_QUESTION_3_ID,
  BROWSER_SESSION_ID,
} from './practice-session-page-controller.browser.fixtures';

export function errorResult(
  code: ActionErrorCode,
  message: string,
): ActionResult<never> {
  return {
    ok: false,
    error: { code, message },
  };
}

export function mockBookmarksAndReview(
  review: ReturnType<typeof createReviewResponse>,
) {
  getBookmarksMock.mockResolvedValue(EMPTY_BOOKMARKS_RESULT);
  getPracticeSessionReviewMock.mockResolvedValue(ok(review));
}

export function mockExamReviewNavigationSession() {
  getPracticeSessionSummaryMock.mockResolvedValue(
    errorResult('CONFLICT', 'Practice session has not ended'),
  );
  mockBookmarksAndReview(
    createReviewResponse({
      mode: 'exam',
      totalCount: 3,
      answeredCount: 3,
      markedCount: 0,
      rows: [
        createReviewRow({
          questionId: BROWSER_QUESTION_1_ID,
          order: 1,
          isAnswered: true,
        }),
        createReviewRow({
          questionId: BROWSER_QUESTION_2_ID,
          order: 2,
          isAnswered: true,
        }),
        createReviewRow({
          questionId: BROWSER_QUESTION_3_ID,
          order: 3,
          isAnswered: true,
        }),
      ],
    }),
  );
  getNextQuestionMock.mockImplementation(async (input) => {
    if (
      typeof input === 'object' &&
      input &&
      'questionId' in input &&
      typeof input.questionId === 'string'
    ) {
      const questionId = input.questionId;
      const questionIndex =
        questionId === BROWSER_QUESTION_1_ID
          ? 0
          : questionId === BROWSER_QUESTION_2_ID
            ? 1
            : questionId === BROWSER_QUESTION_3_ID
              ? 2
              : null;

      if (questionIndex === null) {
        throw new Error(`Unexpected questionId: ${questionId}`);
      }

      return ok(
        createQuestionResponse({
          questionId,
          stemMd: `Stem ${questionId}`,
          choices: [CHOICE_1, CHOICE_2, CHOICE_3],
          session: {
            mode: 'exam',
            deadlineAt: '2099-05-22T12:02:24.000Z',
            index: questionIndex,
            total: 3,
            isMarkedForReview: false,
          },
        }),
      );
    }

    if (
      typeof input === 'object' &&
      input &&
      'fromIndex' in input &&
      typeof input.fromIndex === 'number'
    ) {
      return ok(null);
    }

    return ok(
      createQuestionResponse({
        questionId: BROWSER_QUESTION_3_ID,
        stemMd: 'Stem question-3',
        choices: [CHOICE_1, CHOICE_2, CHOICE_3],
        session: {
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 2,
          total: 3,
          isMarkedForReview: false,
        },
      }),
    );
  });
}

export async function openExamReviewQuestion(
  screen: Awaited<ReturnType<typeof render>>,
) {
  await expect
    .element(screen.getByTestId('question-id'))
    .toHaveTextContent(BROWSER_QUESTION_3_ID);
  await screen.getByRole('button', { name: 'Review & Submit' }).click();
  await expect
    .element(screen.getByRole('heading', { name: 'Review & Submit' }))
    .toBeVisible();
  await screen
    .getByRole('button', {
      name: /Open question 2\..*Question 2.*Answered/i,
    })
    .click();
  await expect
    .element(screen.getByTestId('question-id'))
    .toHaveTextContent(BROWSER_QUESTION_2_ID);
}

export function setupPracticeSessionPageControllerBrowserSpec() {
  beforeAll(async () => {
    const probes = await import(
      './practice-session-page-controller.browser.probes'
    );
    PracticeSessionPageControllerBookmarkPendingProbe =
      probes.PracticeSessionPageControllerBookmarkPendingProbe;
    PracticeSessionPageControllerBookmarkProbe =
      probes.PracticeSessionPageControllerBookmarkProbe;
    PracticeSessionPageControllerHookProbe =
      probes.PracticeSessionPageControllerHookProbe;
    PracticeSessionPageControllerMarkForReviewProbe =
      probes.PracticeSessionPageControllerMarkForReviewProbe;
    PracticeSessionPageControllerNavigationProbe =
      probes.PracticeSessionPageControllerNavigationProbe;
    PracticeSessionPageControllerReviewProbe =
      probes.PracticeSessionPageControllerReviewProbe;
    PracticeSessionPageControllerSummaryProbe =
      probes.PracticeSessionPageControllerSummaryProbe;
    PracticeSessionPageControllerSubmitDuringReviewProbe =
      probes.PracticeSessionPageControllerSubmitDuringReviewProbe;
    PracticeSessionPageControllerViewProbe =
      probes.PracticeSessionPageControllerViewProbe;
  });

  beforeEach(() => {
    getPracticeSessionSummaryMock.mockResolvedValue(
      errorResult('CONFLICT', 'Practice session has not ended'),
    );
    getBookmarksMock.mockResolvedValue(EMPTY_BOOKMARKS_RESULT);
    saveExamDraftAnswerMock.mockImplementation(async (input) =>
      ok({
        questionId:
          typeof input === 'object' &&
          input &&
          'questionId' in input &&
          typeof input.questionId === 'string'
            ? input.questionId
            : BROWSER_QUESTION_1_ID,
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
            : BROWSER_CHOICE_1_ID,
        draftSavedAt: new Date('2026-02-07T00:00:00.000Z'),
        draftCumulativeMs:
          typeof input === 'object' &&
          input &&
          'cumulativeMs' in input &&
          typeof input.cumulativeMs === 'number'
            ? input.cumulativeMs
            : 1_000,
      }),
    );
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    resetPracticeSessionPageControllerBrowserMocks();
  });
}
