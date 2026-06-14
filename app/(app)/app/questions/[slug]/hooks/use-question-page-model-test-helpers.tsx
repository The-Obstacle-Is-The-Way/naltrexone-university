import { afterEach, beforeEach, vi } from 'vitest';
import * as reportClientError from '@/lib/report-client-error';
import type { QuestionOrigin } from '@/lib/routes';
import * as bookmarkController from '@/src/adapters/controllers/bookmark-controller';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import * as questionController from '@/src/adapters/controllers/question-controller';
import * as questionFeedbackController from '@/src/adapters/controllers/question-feedback-controller';
import * as questionViewController from '@/src/adapters/controllers/question-view-controller';
import type { GetBookmarksOutput } from '@/src/application/ports/bookmarks';
import { ok } from '@/tests/test-helpers/ok';
import { installReportClientErrorMocks } from '@/tests/test-helpers/report-client-error-mocks';
import { QUESTION_PAGE_CHOICE_1_ID } from './question-page-model.browser.fixtures';
import { useQuestionPageModel } from './use-question-page-model';

export {
  getQuestionPageQuestionIdForSlug,
  QUESTION_PAGE_ATTEMPT_1_ID,
  QUESTION_PAGE_ATTEMPT_2_ID,
  QUESTION_PAGE_ATTEMPT_3_ID,
  QUESTION_PAGE_CHOICE_1_ID,
  QUESTION_PAGE_CHOICE_2_ID,
  QUESTION_PAGE_QUESTION_1_ID,
  QUESTION_PAGE_QUESTION_2_ID,
} from './question-page-model.browser.fixtures';

vi.mock('@/src/adapters/controllers/question-view-controller', { spy: true });
vi.mock('@/src/adapters/controllers/question-controller', { spy: true });
vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });
vi.mock('@/src/adapters/controllers/bookmark-controller', { spy: true });
vi.mock('@/src/adapters/controllers/question-feedback-controller', {
  spy: true,
});
vi.mock('@/lib/report-client-error', { spy: true });

export const getQuestionBySlug = vi.mocked(
  questionViewController.getQuestionBySlug,
);
export const getPreviousAttempt = vi.mocked(
  questionViewController.getPreviousAttempt,
);
export const submitAnswer = vi.mocked(questionController.submitAnswer);
export const getPracticeSessionReview = vi.mocked(
  practiceController.getPracticeSessionReview,
);
export const getBookmarks = vi.mocked(bookmarkController.getBookmarks);
export const toggleBookmark = vi.mocked(bookmarkController.toggleBookmark);
export const getQuestionRating = vi.mocked(
  questionFeedbackController.getQuestionRating,
);
export const rateQuestion = vi.mocked(questionFeedbackController.rateQuestion);
export const submitQuestionReport = vi.mocked(
  questionFeedbackController.submitQuestionReport,
);
export const reportClientErrorSpy = vi.mocked(
  reportClientError.reportClientError,
);

installReportClientErrorMocks(reportClientError);

const emptyBookmarksResult: { ok: true; data: GetBookmarksOutput } = ok({
  rows: [],
});

export function setupQuestionPageModelBrowserSpec() {
  beforeEach(() => {
    getBookmarks.mockResolvedValue(emptyBookmarksResult);
    toggleBookmark.mockResolvedValue(ok({ bookmarked: false }));
    getQuestionRating.mockResolvedValue(ok({ rating: null }));
    rateQuestion.mockResolvedValue(ok({ rating: null }));
    submitQuestionReport.mockResolvedValue(
      ok({ feedbackId: crypto.randomUUID() }),
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
}

export function Probe({
  slug = 'q-1',
  mode,
  sessionId,
  attemptId,
  from,
  historySequence,
  historyIndex,
  onRender,
}: {
  slug?: string;
  mode?: 'review' | null;
  sessionId?: string;
  attemptId?: string;
  from?: QuestionOrigin | null;
  historySequence?: readonly string[] | null;
  historyIndex?: number | null;
  onRender?: (snapshot: {
    mode?: 'review' | null;
    isLoadingPreviousAttempt: boolean;
    reviewHydrationState: string | null;
  }) => void;
}) {
  const output = useQuestionPageModel({
    slug,
    mode,
    sessionId,
    attemptId,
    from,
    historySequence,
    historyIndex,
  });

  onRender?.({
    mode,
    isLoadingPreviousAttempt: output.isLoadingPreviousAttempt,
    reviewHydrationState: output.reviewHydrationState,
  });

  const total = output.sessionNavigation?.questions.length ?? null;
  const index = output.sessionNavigation?.currentIndex ?? null;
  const currentWasRetried =
    index === null
      ? null
      : (output.sessionNavigation?.questions[index]?.wasRetried ?? null);
  const prevSlug =
    index === null || index <= 0
      ? null
      : (output.sessionNavigation?.questions[index - 1]?.slug ?? null);
  const nextSlug =
    index === null
      ? null
      : (output.sessionNavigation?.questions[index + 1]?.slug ?? null);

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="question-slug">{output.question?.slug ?? ''}</div>
      <div data-testid="selected-choice">{output.selectedChoiceId ?? ''}</div>
      <div data-testid="attempt-id">{output.submitResult?.attemptId ?? ''}</div>
      <div data-testid="unanswered-reveal-correct-choice">
        {output.sessionUnansweredReveal?.correctChoiceId ?? ''}
      </div>
      <div data-testid="session-nav-total">{total ?? ''}</div>
      <div data-testid="session-nav-index">{index ?? ''}</div>
      <div data-testid="session-nav-current-was-retried">
        {currentWasRetried === null ? '' : currentWasRetried ? 'true' : 'false'}
      </div>
      <div data-testid="session-nav-prev-slug">{prevSlug ?? ''}</div>
      <div data-testid="session-nav-next-slug">{nextSlug ?? ''}</div>
      <div data-testid="is-loading-previous-attempt">
        {output.isLoadingPreviousAttempt ? 'true' : 'false'}
      </div>
      <div data-testid="review-hydration-state">
        {output.reviewHydrationState ?? ''}
      </div>
      <div data-testid="bookmark-status">{output.bookmarkStatus}</div>
      <div data-testid="is-bookmark-hydrated">
        {output.isBookmarkHydrated ? 'true' : 'false'}
      </div>
      <div data-testid="is-bookmarked">
        {output.isBookmarked ? 'true' : 'false'}
      </div>
      <div data-testid="feedback-status">
        {output.questionFeedback.feedbackStatus}
      </div>
      <div data-testid="question-rating">
        {output.questionFeedback.rating ?? 'none'}
      </div>
      <div data-testid="is-report-open">
        {output.questionFeedback.isReportOpen ? 'true' : 'false'}
      </div>
      <button
        type="button"
        data-testid="select-choice-1"
        onClick={() => output.onSelectChoice(QUESTION_PAGE_CHOICE_1_ID)}
      >
        Select choice 1
      </button>
      <button
        type="button"
        data-testid="trigger-reattempt"
        onClick={output.onReattempt}
      >
        Trigger reattempt
      </button>
      <button
        type="button"
        data-testid="trigger-submit"
        onClick={() => void output.onSubmit()}
      >
        Trigger submit
      </button>
      <button
        type="button"
        data-testid="trigger-answer-as-new"
        onClick={output.onAnswerAsNew}
      >
        Trigger answer as new
      </button>
      <button
        type="button"
        data-testid="trigger-toggle-bookmark"
        onClick={() => void output.onToggleBookmark()}
      >
        Trigger toggle bookmark
      </button>
      <button
        type="button"
        data-testid="trigger-rate-good"
        onClick={() => void output.questionFeedback.onRate('helpful')}
      >
        Trigger rate good
      </button>
      <button
        type="button"
        data-testid="trigger-open-report"
        onClick={() => output.questionFeedback.openReport()}
      >
        Trigger open report
      </button>
      <button
        type="button"
        data-testid="trigger-submit-report"
        onClick={() =>
          void output.questionFeedback.submitReport({
            category: 'ambiguous_wording',
            comment: 'Needs source',
          })
        }
      >
        Trigger submit report
      </button>
    </>
  );
}
