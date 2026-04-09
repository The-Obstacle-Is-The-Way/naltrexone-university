import type { ReactElement } from 'react';
import { ErrorCard } from '@/components/error-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { EndPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import type { GetCompletedSessionQuestionsWithFeedbackOutput } from '@/src/application/use-cases';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';
import type { LoadState } from '../../practice-page-logic';
import type { ExamResultsSubstage } from '../hooks/use-practice-session-review-stage';
import { PostExamReviewView } from './post-exam-review-view';
import { SessionSummaryView } from './session-summary-view';

type PracticeSessionExamResultsRendererInput = {
  summary: EndPracticeSessionOutput | null;
  postExamSummary?: EndPracticeSessionOutput | null;
  examResultsSubstage?: ExamResultsSubstage | null;
  postExamReview?: GetCompletedSessionQuestionsWithFeedbackOutput | null;
  postExamReviewLoadState?: LoadState;
  postExamReviewCurrentQuestionId?: string | null;
  summaryReview?: GetPracticeSessionReviewOutput | null;
  summaryReviewLoadState?: LoadState;
  questionPanelId: string;
  bookmarkStatus: 'idle' | 'loading' | 'error';
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onRetryPostExamReview?: () => void;
  onNavigatePostExamReviewQuestion?: (questionId: string) => void;
  onReenterPostExamReview?: (questionId?: string) => void;
  onViewSummary?: () => void;
};

export function renderPracticeSessionExamResults(
  input: PracticeSessionExamResultsRendererInput,
): ReactElement | null {
  const summary = input.summary ?? null;
  const postExamSummary = input.postExamSummary ?? null;
  const examResultsSubstage = input.examResultsSubstage ?? null;
  const postExamReview = input.postExamReview ?? null;
  const postExamReviewLoadState = input.postExamReviewLoadState ?? {
    status: 'idle',
  };
  const summaryReview = input.summaryReview ?? null;
  const summaryReviewLoadState = input.summaryReviewLoadState ?? {
    status: 'idle',
  };

  const shouldRenderExamSummary =
    summary?.mode === 'exam' && examResultsSubstage !== 'post_exam_review';

  if (shouldRenderExamSummary && summary) {
    return (
      <SessionSummaryView
        summary={summary}
        review={summaryReview}
        reviewLoadState={summaryReviewLoadState}
        onReviewAnswers={
          input.onReenterPostExamReview
            ? () => input.onReenterPostExamReview?.()
            : undefined
        }
        onOpenReviewQuestion={input.onReenterPostExamReview}
        isReviewLoading={postExamReviewLoadState.status === 'loading'}
        reviewEntryErrorMessage={
          postExamReviewLoadState.status === 'error'
            ? postExamReviewLoadState.message
            : null
        }
      />
    );
  }

  if (examResultsSubstage !== 'post_exam_review') return null;

  if (postExamReviewLoadState.status === 'loading' && postExamSummary) {
    return (
      <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
        <output aria-live="polite">Loading review...</output>
      </Card>
    );
  }

  if (postExamReviewLoadState.status === 'error' && postExamSummary) {
    return (
      <div className="space-y-4">
        <ErrorCard>{postExamReviewLoadState.message}</ErrorCard>
        <div className="flex flex-wrap gap-3">
          {input.onRetryPostExamReview ? (
            <Button
              type="button"
              variant="outline"
              onClick={input.onRetryPostExamReview}
            >
              Retry review
            </Button>
          ) : null}
          {input.onViewSummary ? (
            <Button
              type="button"
              variant="outline"
              onClick={input.onViewSummary}
            >
              View Summary
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!postExamSummary || !postExamReview) return null;

  return (
    <PostExamReviewView
      summary={postExamSummary}
      review={postExamReview}
      currentQuestionId={input.postExamReviewCurrentQuestionId ?? null}
      controlledPanelId={input.questionPanelId}
      bookmarkStatus={input.bookmarkStatus}
      isBookmarked={input.isBookmarked}
      onToggleBookmark={input.onToggleBookmark}
      onNavigateQuestion={
        input.onNavigatePostExamReviewQuestion ?? (() => undefined)
      }
      onViewSummary={input.onViewSummary ?? (() => undefined)}
    />
  );
}
