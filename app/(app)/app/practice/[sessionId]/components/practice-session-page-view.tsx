import { useCallback, useMemo } from 'react';
import { PracticeView } from '@/app/(app)/app/practice/components/practice-view';
import {
  fireAndForget,
  logUnhandledAsyncError,
} from '@/app/(app)/app/practice/fire-and-forget';
import { ErrorCard } from '@/components/error-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { EndPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import type { LoadState } from '../../practice-page-logic';
import { ExamReviewView, QuestionNavigator } from './exam-review-view';
import { SessionSummaryView } from './session-summary-view';

export type PracticeSessionPageViewProps = {
  summary: EndPracticeSessionOutput | null;
  summaryReview?: GetPracticeSessionReviewOutput | null;
  summaryReviewLoadState?: LoadState;
  review?: GetPracticeSessionReviewOutput | null;
  reviewLoadState?: LoadState;
  navigator?: GetPracticeSessionReviewOutput | null;
  navigatorLoadState?: LoadState;
  sessionInfo: NextQuestion['session'];
  loadState: LoadState;
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  isAnswered: boolean;
  submitResult: SubmitAnswerOutput | null;
  isPending: boolean;
  bookmarkStatus: 'idle' | 'loading' | 'error';
  isBookmarked: boolean;
  isMarkingForReview?: boolean;
  bookmarkMessage?: string | null;
  bookmarkMessageVersion?: number;
  canSubmit: boolean;
  onEndSession: () => void;
  onRetryReview?: () => void;
  onRetryNavigator?: () => void;
  onTryAgain: () => void;
  onRetryBookmarks?: () => void;
  onToggleBookmark: () => void;
  onToggleMarkForReview?: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onNextQuestion: () => void;
  onNavigateQuestion?: (questionId: string) => void;
  onOpenReviewQuestion?: (questionId: string) => void;
  onFinalizeReview?: () => Promise<void>;
};

export function PracticeSessionPageView(props: PracticeSessionPageViewProps) {
  const review = props.review ?? null;
  const reviewLoadState = props.reviewLoadState ?? { status: 'idle' };
  const summaryReview = props.summaryReview ?? null;
  const summaryReviewLoadState = props.summaryReviewLoadState ?? {
    status: 'idle',
  };
  const navigator = props.navigator ?? null;
  const navigatorLoadState = props.navigatorLoadState ?? { status: 'idle' };
  const currentQuestionId = props.question?.questionId ?? null;
  const onNavigateQuestion = props.onNavigateQuestion;

  const previousQuestionId = useMemo(() => {
    if (!navigator || !currentQuestionId) return null;
    const currentIdx = navigator.rows.findIndex(
      (r) => r.questionId === currentQuestionId,
    );
    if (currentIdx <= 0) return null;

    for (let i = currentIdx - 1; i >= 0; i -= 1) {
      const row = navigator.rows[i];
      if (!row) continue;
      if (!row.isAvailable) continue;
      return row.questionId;
    }

    return null;
  }, [navigator, currentQuestionId]);

  const nextQuestionId = useMemo(() => {
    if (!navigator || !currentQuestionId) return null;
    const currentIdx = navigator.rows.findIndex(
      (r) => r.questionId === currentQuestionId,
    );
    if (currentIdx < 0 || currentIdx >= navigator.rows.length - 1) return null;

    for (let i = currentIdx + 1; i < navigator.rows.length; i += 1) {
      const row = navigator.rows[i];
      if (!row) continue;
      if (!row.isAvailable) continue;
      return row.questionId;
    }

    return null;
  }, [navigator, currentQuestionId]);

  const onPreviousQuestion = useCallback(() => {
    if (previousQuestionId && onNavigateQuestion) {
      onNavigateQuestion(previousQuestionId);
    }
  }, [previousQuestionId, onNavigateQuestion]);

  if (props.summary) {
    return (
      <SessionSummaryView
        summary={props.summary}
        review={summaryReview}
        reviewLoadState={summaryReviewLoadState}
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
        <ErrorCard className="p-6">{reviewLoadState.message}</ErrorCard>
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
  const progress = props.sessionInfo
    ? `Question ${props.sessionInfo.index + 1} of ${props.sessionInfo.total}`
    : null;
  const modeHint =
    mode === 'exam'
      ? 'Explanations shown after you submit the exam.'
      : 'Explanations shown after each answer.';
  const description = progress ? `${progress} — ${modeHint}` : modeHint;

  return (
    <PracticeView
      title={title}
      description={description}
      topContent={
        navigator && props.onNavigateQuestion ? (
          <QuestionNavigator
            review={navigator}
            currentQuestionId={props.question?.questionId ?? null}
            onNavigateQuestion={props.onNavigateQuestion}
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
      canSubmit={props.canSubmit}
      endSessionLabel={mode === 'exam' ? 'Review answers' : 'End session'}
      onEndSession={props.onEndSession}
      onTryAgain={props.onTryAgain}
      onRetryBookmarks={props.onRetryBookmarks}
      onToggleBookmark={props.onToggleBookmark}
      onToggleMarkForReview={props.onToggleMarkForReview}
      onSelectChoice={props.onSelectChoice}
      onSubmit={props.onSubmit}
      onNextQuestion={props.onNextQuestion}
      onPreviousQuestion={
        props.onNavigateQuestion ? onPreviousQuestion : undefined
      }
      hasPreviousQuestion={previousQuestionId !== null}
      hasNextQuestion={nextQuestionId !== null}
    />
  );
}
