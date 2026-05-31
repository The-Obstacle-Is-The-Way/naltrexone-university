import { useEffect, useState } from 'react';
import { PracticeSessionPageView } from '../components/practice-session-page-view';
import {
  BROWSER_CHOICE_1_ID,
  BROWSER_QUESTION_1_ID,
  BROWSER_SESSION_ID,
} from './practice-session-page-controller.browser.fixtures';
import { usePracticeSessionPageController } from './use-practice-session-page-controller';

type HookStateValue = string | number | boolean | null | undefined;

type HookStateEntry = {
  testId: string;
  value: HookStateValue;
};

type ProbeAction = {
  label: string;
  onClick: () => void;
};

function toDisplayValue(value: HookStateValue): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

function renderHookState(entries: readonly HookStateEntry[]) {
  return entries.map(({ testId, value }) => (
    <div key={testId} data-testid={testId}>
      {toDisplayValue(value)}
    </div>
  ));
}

function renderActionButtons(actions: readonly ProbeAction[]) {
  return actions.map(({ label, onClick }) => (
    <button key={label} type="button" onClick={onClick}>
      {label}
    </button>
  ));
}

function getActiveView(
  output: ReturnType<typeof usePracticeSessionPageController>,
) {
  if (output.examResultsSubstage === 'session_summary') return 'summary';
  if (output.examResultsSubstage === 'post_exam_review') {
    return 'post-exam-review';
  }
  if (output.summary) return 'summary';
  if (output.postExamReview) return 'post-exam-review';
  if (output.review) return 'review';
  if (output.question) return 'question';
  return '';
}

export function PracticeSessionPageControllerHookProbe() {
  const output = usePracticeSessionPageController(BROWSER_SESSION_ID);
  const errorMessage =
    output.loadState.status === 'error' ? output.loadState.message : '';

  return (
    <>
      {renderHookState([
        { testId: 'load-status', value: output.loadState.status },
        { testId: 'is-pending', value: output.isPending },
        { testId: 'question-id', value: output.question?.questionId },
        { testId: 'selected-choice-id', value: output.selectedChoiceId },
        { testId: 'can-submit', value: output.canSubmit },
        { testId: 'error-message', value: errorMessage },
      ])}
      {renderActionButtons([
        {
          label: 'select-choice-1',
          onClick: () => output.onSelectChoice(BROWSER_CHOICE_1_ID),
        },
        {
          label: 'submit-answer',
          onClick: () => {
            void output.onSubmit();
          },
        },
      ])}
    </>
  );
}

export function PracticeSessionPageControllerNavigationProbe() {
  const output = usePracticeSessionPageController(BROWSER_SESSION_ID);

  return (
    <>
      {renderHookState([
        { testId: 'load-status', value: output.loadState.status },
        { testId: 'question-id', value: output.question?.questionId },
        { testId: 'selected-choice-id', value: output.selectedChoiceId },
        { testId: 'has-submit-result', value: output.submitResult !== null },
        {
          testId: 'submit-result-correct-choice-id',
          value: output.submitResult?.correctChoiceId,
        },
        {
          testId: 'submit-result-explanation-md',
          value: output.submitResult?.explanationMd,
        },
        { testId: 'can-submit', value: output.canSubmit },
      ])}
      {renderActionButtons([
        {
          label: 'select-choice-1',
          onClick: () => output.onSelectChoice(BROWSER_CHOICE_1_ID),
        },
        {
          label: 'submit-answer',
          onClick: () => {
            void output.onSubmit();
          },
        },
        {
          label: 'next-question',
          onClick: () => output.onNextQuestion(),
        },
        {
          label: 'navigate-question-1',
          onClick: () => output.onNavigateQuestion?.(BROWSER_QUESTION_1_ID),
        },
      ])}
    </>
  );
}

export function PracticeSessionPageControllerBookmarkProbe() {
  const output = usePracticeSessionPageController(BROWSER_SESSION_ID);
  const [bookmarkFeedbackCount, setBookmarkFeedbackCount] = useState(0);
  const bookmarkMessage = output.bookmarkMessage;
  const bookmarkMessageVersion = output.bookmarkMessageVersion ?? 0;

  useEffect(() => {
    if (!bookmarkMessage) return;
    if (bookmarkMessageVersion < 1) return;
    setBookmarkFeedbackCount((prev) => prev + 1);
  }, [bookmarkMessage, bookmarkMessageVersion]);

  return (
    <>
      {renderHookState([
        { testId: 'load-status', value: output.loadState.status },
        { testId: 'bookmark-feedback-count', value: bookmarkFeedbackCount },
      ])}
      {renderActionButtons([
        {
          label: 'toggle-bookmark',
          onClick: () => {
            void output.onToggleBookmark();
          },
        },
      ])}
    </>
  );
}

export function PracticeSessionPageControllerBookmarkPendingProbe() {
  const output = usePracticeSessionPageController(BROWSER_SESSION_ID);

  return (
    <>
      {renderHookState([
        { testId: 'load-status', value: output.loadState.status },
        { testId: 'is-pending', value: output.isPending },
      ])}
      {renderActionButtons([
        {
          label: 'toggle-bookmark',
          onClick: () => {
            void output.onToggleBookmark();
          },
        },
      ])}
    </>
  );
}

export function PracticeSessionPageControllerReviewProbe() {
  const output = usePracticeSessionPageController(BROWSER_SESSION_ID);

  return (
    <>
      {renderHookState([
        { testId: 'active-view', value: getActiveView(output) },
        { testId: 'load-status', value: output.loadState.status },
        { testId: 'question-id', value: output.question?.questionId },
        { testId: 'summary-session-id', value: output.summary?.sessionId },
        { testId: 'has-submit-result', value: output.submitResult !== null },
        {
          testId: 'review-answered-count',
          value: output.review?.answeredCount,
        },
        {
          testId: 'review-row-answered',
          value: output.review?.rows[0]?.isAnswered,
        },
        {
          testId: 'post-exam-current-question-id',
          value: output.postExamReviewCurrentQuestionId,
        },
      ])}
      {renderActionButtons([
        {
          label: 'review-answers',
          onClick: () => output.onEndSession(),
        },
        {
          label: 'finalize-review',
          onClick: () => {
            void output.onFinalizeReview?.();
          },
        },
        {
          label: 'view-summary',
          onClick: () => output.onViewSummary?.(),
        },
        {
          label: 'open-review-question-1',
          onClick: () => output.onOpenReviewQuestion?.(BROWSER_QUESTION_1_ID),
        },
        {
          label: 'select-choice-1',
          onClick: () => output.onSelectChoice(BROWSER_CHOICE_1_ID),
        },
        {
          label: 'submit-answer',
          onClick: () => {
            void output.onSubmit();
          },
        },
      ])}
    </>
  );
}

export function PracticeSessionPageControllerSubmitDuringReviewProbe() {
  const output = usePracticeSessionPageController(BROWSER_SESSION_ID);

  return (
    <>
      {renderHookState([
        { testId: 'active-view', value: getActiveView(output) },
        { testId: 'load-status', value: output.loadState.status },
        { testId: 'question-id', value: output.question?.questionId },
      ])}
      {renderActionButtons([
        {
          label: 'select-choice-1',
          onClick: () => output.onSelectChoice(BROWSER_CHOICE_1_ID),
        },
        {
          label: 'submit-answer',
          onClick: () => {
            void output.onSubmit();
          },
        },
        {
          label: 'review-answers',
          onClick: () => output.onEndSession(),
        },
        {
          label: 'finalize-review',
          onClick: () => {
            void output.onFinalizeReview?.();
          },
        },
      ])}
    </>
  );
}

export function PracticeSessionPageControllerMarkForReviewProbe() {
  const output = usePracticeSessionPageController(BROWSER_SESSION_ID);
  const isMarkedForReview = output.sessionInfo?.isMarkedForReview ?? null;

  return (
    <>
      {renderHookState([
        { testId: 'load-status', value: output.loadState.status },
        { testId: 'question-id', value: output.question?.questionId },
        { testId: 'is-marking', value: output.isMarkingForReview },
        { testId: 'marked-for-review', value: isMarkedForReview },
      ])}
      {renderActionButtons([
        {
          label: 'toggle-mark-for-review',
          onClick: () => {
            void output.onToggleMarkForReview?.();
          },
        },
        {
          label: 'next-question',
          onClick: () => output.onNextQuestion(),
        },
      ])}
    </>
  );
}

export function PracticeSessionPageControllerSummaryProbe() {
  const output = usePracticeSessionPageController(BROWSER_SESSION_ID);
  const errorMessage =
    output.loadState.status === 'error' ? output.loadState.message : '';

  return (
    <>
      {renderHookState([
        { testId: 'active-view', value: getActiveView(output) },
        { testId: 'load-status', value: output.loadState.status },
        { testId: 'question-id', value: output.question?.questionId },
        { testId: 'summary-session-id', value: output.summary?.sessionId },
        { testId: 'summary-mode', value: output.summary?.mode },
        { testId: 'error-message', value: errorMessage },
      ])}
      {renderActionButtons([
        {
          label: 'end-session',
          onClick: () => output.onEndSession(),
        },
        {
          label: 'try-again',
          onClick: () => output.onTryAgain(),
        },
      ])}
    </>
  );
}

export function PracticeSessionPageControllerViewProbe() {
  const output = usePracticeSessionPageController(BROWSER_SESSION_ID);

  return (
    <>
      {renderHookState([
        { testId: 'active-view', value: getActiveView(output) },
        { testId: 'question-id', value: output.question?.questionId },
        {
          testId: 'navigator-load-status',
          value: output.navigatorLoadState?.status ?? '',
        },
        {
          testId: 'navigator-question-count',
          value: output.navigator?.rows.length ?? null,
        },
      ])}
      <PracticeSessionPageView {...output} />
    </>
  );
}
