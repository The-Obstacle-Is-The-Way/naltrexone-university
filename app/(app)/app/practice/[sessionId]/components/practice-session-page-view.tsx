import { PracticeView } from '@/app/(app)/app/practice/components/practice-view';
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
  sessionInfo: NextQuestion['session'];
  loadState: LoadState;
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  isPending: boolean;
  bookmarkStatus: 'idle' | 'loading' | 'error';
  isBookmarked: boolean;
  isMarkingForReview?: boolean;
  bookmarkMessage?: string | null;
  canSubmit: boolean;
  onEndSession: () => void;
  onRetryReview?: () => void;
  onTryAgain: () => void;
  onToggleBookmark: () => void;
  onToggleMarkForReview?: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onNextQuestion: () => void;
  onNavigateQuestion?: (questionId: string) => void;
  onOpenReviewQuestion?: (questionId: string) => void;
  onFinalizeReview?: () => void;
};

export function PracticeSessionPageView(props: PracticeSessionPageViewProps) {
  const review = props.review ?? null;
  const reviewLoadState = props.reviewLoadState ?? { status: 'idle' };
  const summaryReview = props.summaryReview ?? null;
  const summaryReviewLoadState = props.summaryReviewLoadState ?? {
    status: 'idle',
  };
  const navigator = props.navigator ?? null;

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
        Loading review...
      </Card>
    );
  }

  if (reviewLoadState.status === 'error' && !review) {
    return (
      <div className="space-y-4">
        <ErrorCard className="border-border bg-card p-6">
          {reviewLoadState.message}
        </ErrorCard>
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
            onClick={props.onFinalizeReview ?? props.onEndSession}
          >
            End session
          </Button>
        </div>
      </div>
    );
  }

  if (review) {
    return (
      <ExamReviewView
        review={review}
        isPending={props.isPending}
        onOpenQuestion={props.onOpenReviewQuestion ?? (() => undefined)}
        onFinalizeReview={props.onFinalizeReview ?? props.onEndSession}
      />
    );
  }

  return (
    <PracticeView
      topContent={
        navigator && props.onNavigateQuestion ? (
          <QuestionNavigator
            review={navigator}
            currentQuestionId={props.question?.questionId ?? null}
            onNavigateQuestion={props.onNavigateQuestion}
          />
        ) : undefined
      }
      sessionInfo={props.sessionInfo}
      loadState={props.loadState}
      question={props.question}
      selectedChoiceId={props.selectedChoiceId}
      submitResult={props.submitResult}
      isPending={props.isPending}
      bookmarkStatus={props.bookmarkStatus}
      isBookmarked={props.isBookmarked}
      isMarkingForReview={props.isMarkingForReview}
      bookmarkMessage={props.bookmarkMessage}
      canSubmit={props.canSubmit}
      endSessionLabel={
        props.sessionInfo?.mode === 'exam' ? 'Review answers' : 'End session'
      }
      onEndSession={props.onEndSession}
      onTryAgain={props.onTryAgain}
      onToggleBookmark={props.onToggleBookmark}
      onToggleMarkForReview={props.onToggleMarkForReview}
      onSelectChoice={props.onSelectChoice}
      onSubmit={props.onSubmit}
      onNextQuestion={props.onNextQuestion}
    />
  );
}
