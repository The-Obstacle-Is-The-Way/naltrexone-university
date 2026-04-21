'use client';

import { useEffect, useRef } from 'react';
import { Feedback } from '@/components/question/feedback';
import { QuestionCard } from '@/components/question/question-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type {
  EndPracticeSessionOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
} from '@/src/adapters/controllers/practice-controller';
import { QuestionNavigator } from './exam-review-view';
import { focusElementWithoutScroll } from './focus-element-without-scroll';

type PostExamReviewViewProps = {
  summary: EndPracticeSessionOutput;
  review: GetCompletedSessionQuestionsWithFeedbackOutput;
  currentQuestionId: string | null;
  controlledPanelId: string;
  bookmarkStatus: 'idle' | 'loading' | 'error';
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onNavigateQuestion: (questionId: string) => void;
  onViewSummary: () => void;
};

export function PostExamReviewView({
  summary,
  review,
  currentQuestionId,
  controlledPanelId,
  bookmarkStatus,
  isBookmarked,
  onToggleBookmark,
  onNavigateQuestion,
  onViewSummary,
}: PostExamReviewViewProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const shouldRestorePanelRef = useRef(false);
  const currentRow =
    review.rows.find((row) => row.questionId === currentQuestionId) ??
    review.rows[0] ??
    null;
  const currentIndex = currentRow
    ? review.rows.findIndex((row) => row.questionId === currentRow.questionId)
    : -1;
  const previousRow =
    currentIndex > 0 ? (review.rows[currentIndex - 1] ?? null) : null;
  const nextRow =
    currentIndex >= 0 && currentIndex < review.rows.length - 1
      ? (review.rows[currentIndex + 1] ?? null)
      : null;
  const focusedQuestionId = currentRow?.questionId ?? null;
  const scoreLabel = `Score: ${Math.round(summary.totals.accuracy * 100)}% (${summary.totals.correct}/${summary.questionCount})`;
  const navigateToQuestion = (questionId: string) => {
    shouldRestorePanelRef.current = true;
    onNavigateQuestion(questionId);
  };

  useEffect(() => {
    if (focusedQuestionId === null) return;

    const panel = panelRef.current;
    focusElementWithoutScroll(panel);

    if (!shouldRestorePanelRef.current) return;

    shouldRestorePanelRef.current = false;
    panel?.scrollIntoView({ block: 'start' });
  }, [focusedQuestionId]);

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Exam complete</div>
            <h1 className="mt-1 text-2xl font-bold font-heading tracking-tight text-foreground">
              {scoreLabel}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review each question with detailed feedback.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="self-start rounded-full sm:self-auto"
            onClick={onViewSummary}
          >
            View Summary
          </Button>
        </div>
      </Card>

      <QuestionNavigator
        review={review}
        currentQuestionId={currentRow?.questionId ?? null}
        controlledPanelId={controlledPanelId}
        mode="review"
        onNavigateQuestion={navigateToQuestion}
      />

      {currentRow ? (
        <section
          ref={panelRef}
          id={controlledPanelId}
          aria-label={`Question ${currentRow.order} of ${review.totalCount}`}
          className="space-y-6 outline-none focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          tabIndex={-1}
        >
          <p className="text-sm text-muted-foreground">
            Question {currentRow.order} of {review.totalCount}
          </p>

          {currentRow.isAvailable ? (
            <>
              <QuestionCard
                stemMd={currentRow.stemMd}
                choices={currentRow.choices}
                selectedChoiceId={currentRow.selectedChoiceId}
                correctChoiceId={currentRow.correctChoiceId}
                disabled
                onSelectChoice={() => undefined}
              />
              {!currentRow.isAnswered ? (
                <Card
                  className="gap-0 rounded-2xl border-warning/50 bg-warning/5 p-4 text-sm text-foreground shadow-sm"
                  role="status"
                >
                  You did not answer this question during this session.
                </Card>
              ) : null}
              <Feedback
                isCorrect={currentRow.isCorrect === true}
                isUnanswered={!currentRow.isAnswered}
                explanationMd={currentRow.explanationMd}
                referenceMd={currentRow.referenceMd}
                choiceExplanations={currentRow.choiceExplanations}
                selectedChoiceId={currentRow.selectedChoiceId}
              />
            </>
          ) : (
            <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
              Question no longer available.
            </Card>
          )}
        </section>
      ) : (
        <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
          No reviewed questions available.
        </Card>
      )}

      <div
        className="flex flex-col gap-3 sm:flex-row"
        data-testid="bottom-action-bar"
      >
        {previousRow ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => navigateToQuestion(previousRow.questionId)}
          >
            Previous
          </Button>
        ) : null}

        {nextRow ? (
          <Button
            type="button"
            className="rounded-full"
            onClick={() => navigateToQuestion(nextRow.questionId)}
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            className="rounded-full"
            onClick={onViewSummary}
          >
            Finish review
          </Button>
        )}

        {currentRow?.isAvailable ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full sm:ml-auto"
            aria-pressed={isBookmarked}
            disabled={bookmarkStatus === 'loading'}
            onClick={onToggleBookmark}
          >
            {isBookmarked ? 'Remove bookmark' : 'Bookmark'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
