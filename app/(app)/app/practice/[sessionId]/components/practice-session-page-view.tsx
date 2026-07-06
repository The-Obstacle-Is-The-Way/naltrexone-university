import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import {
  PracticeView,
  type PracticeViewProps,
} from '@/app/(app)/app/practice/components/practice-view';
import {
  fireAndForget,
  logUnhandledAsyncError,
} from '@/app/(app)/app/practice/fire-and-forget';
import { ErrorCard } from '@/components/error-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { EndPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import type { GetCompletedSessionQuestionsWithFeedbackOutput } from '@/src/application/use-cases';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import type { LoadState } from '../../practice-page-logic';
import { ExamReviewView, QuestionNavigator } from './exam-review-view';
import { focusElementWithoutScroll } from './focus-element-without-scroll';
import { renderPracticeSessionExamResults } from './practice-session-exam-results-renderer';
import { findAdjacentAvailableQuestionId } from './practice-session-question-navigation';
import { SessionSummaryView } from './session-summary-view';
export type PracticeSessionPageViewProps = {
  summary: EndPracticeSessionOutput | null;
  postExamSummary?: EndPracticeSessionOutput | null | undefined;
  examResultsSubstage?:
    | 'post_exam_review'
    | 'session_summary'
    | null
    | undefined;
  postExamReview?:
    | GetCompletedSessionQuestionsWithFeedbackOutput
    | null
    | undefined;
  postExamReviewLoadState?: LoadState | undefined;
  postExamReviewCurrentQuestionId?: string | null | undefined;
  summaryReview?: GetPracticeSessionReviewOutput | null | undefined;
  summaryReviewLoadState?: LoadState | undefined;
  review?: GetPracticeSessionReviewOutput | null | undefined;
  reviewLoadState?: LoadState | undefined;
  navigator?: GetPracticeSessionReviewOutput | null | undefined;
  navigatorLoadState?: LoadState | undefined;
  examTimer?: ReactNode | undefined;
  sessionInfo: NextQuestion['session'];
  loadState: LoadState;
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  isAnswered: boolean;
  submitResult: SubmitAnswerOutput | null;
  isPending: boolean;
  bookmarkStatus: 'idle' | 'loading' | 'error';
  isBookmarked: boolean;
  isMarkingForReview?: boolean | undefined;
  bookmarkMessage?: string | null | undefined;
  bookmarkMessageVersion?: number | undefined;
  questionFeedback?: PracticeViewProps['questionFeedback'];
  onEndSession: () => void;
  onRetryReview?: (() => void) | undefined;
  onRetryPostExamReview?: (() => void) | undefined;
  onRetryNavigator?: (() => void) | undefined;
  onTryAgain: () => void;
  onRetryBookmarks?: (() => void) | undefined;
  onToggleBookmark: () => void;
  onToggleMarkForReview?: (() => void) | undefined;
  onSelectChoice: (choiceId: string) => void;
  onNextQuestion: () => void;
  onNavigateQuestion?: ((questionId: string) => void) | undefined;
  onOpenReviewQuestion?: ((questionId: string) => void) | undefined;
  onNavigatePostExamReviewQuestion?: ((questionId: string) => void) | undefined;
  onReenterPostExamReview?: ((questionId?: string) => void) | undefined;
  onViewSummary?: (() => void) | undefined;
  onFinalizeReview?: (() => Promise<boolean | void>) | undefined;
};

export function PracticeSessionPageView(props: PracticeSessionPageViewProps) {
  const review = props.review ?? null;
  const reviewLoadState = props.reviewLoadState ?? { status: 'idle' };
  const navigator = props.navigator ?? null;
  const navigatorLoadState = props.navigatorLoadState ?? { status: 'idle' };
  const currentQuestionId = props.question?.questionId ?? null;
  const questionPanelId = useId();
  const questionAreaRef = useRef<HTMLElement | null>(null);
  const shouldRestoreQuestionPanelRef = useRef(false);
  const lastQuestionIdRef = useRef<string | null>(currentQuestionId);
  const previousQuestionId = useMemo(
    () => findAdjacentAvailableQuestionId(navigator, currentQuestionId, -1),
    [currentQuestionId, navigator],
  );
  const nextQuestionId = useMemo(
    () => findAdjacentAvailableQuestionId(navigator, currentQuestionId, 1),
    [currentQuestionId, navigator],
  );
  const restoreQuestionPanel = useCallback(() => {
    const panel = questionAreaRef.current;
    if (!panel) return;

    focusElementWithoutScroll(panel);
    panel.scrollIntoView({ block: 'start' });
  }, []);
  const navigateToQuestion = useCallback(
    (questionId: string) => {
      if (!props.onNavigateQuestion) return;

      shouldRestoreQuestionPanelRef.current = true;
      props.onNavigateQuestion(questionId);
    },
    [props.onNavigateQuestion],
  );
  const onPreviousQuestion = useCallback(() => {
    if (!previousQuestionId) return;

    navigateToQuestion(previousQuestionId);
  }, [navigateToQuestion, previousQuestionId]);

  const onNextQuestionResolved = useCallback(() => {
    shouldRestoreQuestionPanelRef.current = true;

    if (nextQuestionId && props.onNavigateQuestion) {
      props.onNavigateQuestion(nextQuestionId);
      return;
    }
    props.onNextQuestion();
  }, [nextQuestionId, props.onNavigateQuestion, props.onNextQuestion]);
  const onTryAgainResolved = useCallback(() => {
    shouldRestoreQuestionPanelRef.current = true;
    props.onTryAgain();
  }, [props.onTryAgain]);
  useEffect(() => {
    if (!shouldRestoreQuestionPanelRef.current) {
      lastQuestionIdRef.current = currentQuestionId;
      return;
    }

    const questionChanged = lastQuestionIdRef.current !== currentQuestionId;
    const navigationStateVisible = props.loadState.status !== 'ready';

    lastQuestionIdRef.current = currentQuestionId;

    if (!questionChanged && !navigationStateVisible) return;

    shouldRestoreQuestionPanelRef.current = false;
    restoreQuestionPanel();
  }, [currentQuestionId, props.loadState.status, restoreQuestionPanel]);
  const examResults = renderPracticeSessionExamResults({
    summary: props.summary,
    postExamSummary: props.postExamSummary,
    examResultsSubstage: props.examResultsSubstage,
    postExamReview: props.postExamReview,
    postExamReviewLoadState: props.postExamReviewLoadState,
    postExamReviewCurrentQuestionId: props.postExamReviewCurrentQuestionId,
    summaryReview: props.summaryReview,
    summaryReviewLoadState: props.summaryReviewLoadState,
    questionPanelId,
    bookmarkStatus: props.bookmarkStatus,
    isBookmarked: props.isBookmarked,
    questionFeedback: props.questionFeedback ?? null,
    onToggleBookmark: props.onToggleBookmark,
    onRetryPostExamReview: props.onRetryPostExamReview,
    onNavigatePostExamReviewQuestion: props.onNavigatePostExamReviewQuestion,
    onReenterPostExamReview: props.onReenterPostExamReview,
    onViewSummary: props.onViewSummary,
  });
  if (examResults) return examResults;
  if (props.summary && props.summary.mode !== 'exam') {
    return (
      <SessionSummaryView
        summary={props.summary}
        review={props.summaryReview ?? null}
        reviewLoadState={props.summaryReviewLoadState ?? { status: 'idle' }}
      />
    );
  }
  if (reviewLoadState.status === 'loading' && !review) {
    return (
      <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
        <output aria-live="polite">Loading review...</output>
      </Card>
    );
  }
  if (reviewLoadState.status === 'error' && !review) {
    return (
      <div className="space-y-4">
        <ErrorCard>{reviewLoadState.message}</ErrorCard>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={props.onRetryReview ?? props.onEndSession}
          >
            Try again
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (props.onFinalizeReview) {
                fireAndForget(props.onFinalizeReview(), logUnhandledAsyncError);
                return;
              }
              props.onEndSession();
            }}
          >
            End session
          </Button>
        </div>
      </div>
    );
  }
  if (review) {
    const onFinalizeReview =
      props.onFinalizeReview ??
      (async () => {
        props.onEndSession();
      });
    return (
      <ExamReviewView
        review={review}
        isPending={props.isPending}
        onOpenQuestion={props.onOpenReviewQuestion ?? (() => undefined)}
        onFinalizeReview={onFinalizeReview}
      />
    );
  }
  const mode = props.sessionInfo?.mode ?? 'tutor';
  const title = mode === 'exam' ? 'Exam Session' : 'Tutor Session';
  const modeHint =
    mode === 'exam'
      ? 'Explanations shown after you submit the exam.'
      : 'Explanations shown after each answer.';
  const description = props.sessionInfo
    ? `Question ${props.sessionInfo.index + 1} of ${props.sessionInfo.total} — ${modeHint}`
    : modeHint;
  return (
    <PracticeView
      title={title}
      description={description}
      questionPanelId={questionPanelId}
      questionAreaRef={questionAreaRef}
      topContent={
        navigator && props.onNavigateQuestion ? (
          <QuestionNavigator
            review={navigator}
            currentQuestionId={currentQuestionId}
            controlledPanelId={questionPanelId}
            onNavigateQuestion={navigateToQuestion}
          />
        ) : navigatorLoadState.status === 'error' ? (
          <ErrorCard className="p-4">
            <div>{navigatorLoadState.message}</div>
            {props.onRetryNavigator ? (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={props.onRetryNavigator}
                >
                  Retry navigator
                </Button>
              </div>
            ) : null}
          </ErrorCard>
        ) : undefined
      }
      sessionInfo={props.sessionInfo}
      examTimer={props.examTimer}
      loadState={props.loadState}
      question={props.question}
      selectedChoiceId={props.selectedChoiceId}
      isAnswered={props.isAnswered}
      submitResult={props.submitResult}
      isPending={props.isPending}
      bookmarkStatus={props.bookmarkStatus}
      isBookmarked={props.isBookmarked}
      isMarkingForReview={props.isMarkingForReview}
      bookmarkMessage={props.bookmarkMessage}
      bookmarkMessageVersion={props.bookmarkMessageVersion}
      questionFeedback={props.questionFeedback ?? null}
      endSessionLabel={mode === 'exam' ? 'Review & Submit' : 'End session'}
      onEndSession={props.onEndSession}
      onTryAgain={onTryAgainResolved}
      onRetryBookmarks={props.onRetryBookmarks}
      onToggleBookmark={props.onToggleBookmark}
      onToggleMarkForReview={props.onToggleMarkForReview}
      onSelectChoice={props.onSelectChoice}
      onNextQuestion={onNextQuestionResolved}
      onPreviousQuestion={
        props.onNavigateQuestion ? onPreviousQuestion : undefined
      }
      canNavigatePrevious={previousQuestionId !== null}
      hasPreviousQuestion={(props.sessionInfo?.index ?? 0) > 0}
      hasNextQuestion={nextQuestionId !== null}
    />
  );
}
