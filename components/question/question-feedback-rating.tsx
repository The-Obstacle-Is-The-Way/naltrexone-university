'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QuestionFeedbackRating as QuestionFeedbackRatingValue } from '@/src/domain/value-objects';

export type QuestionFeedbackStatus =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'saved'
  | 'error';

export type QuestionFeedbackRatingProps = {
  rating: QuestionFeedbackRatingValue | null;
  feedbackStatus: QuestionFeedbackStatus;
  onRate: (rating: QuestionFeedbackRatingValue | null) => void;
};

function getStatusMessage(status: QuestionFeedbackStatus): string {
  if (status === 'saving') return 'Saving rating';
  if (status === 'saved') return 'Rating saved';
  if (status === 'error') return "Couldn't save rating";
  return '';
}

export function QuestionFeedbackRating({
  rating,
  feedbackStatus,
  onRate,
}: QuestionFeedbackRatingProps) {
  const isSaving = feedbackStatus === 'saving';
  const statusMessage = getStatusMessage(feedbackStatus);
  const statusClassName = cn(
    'text-sm',
    feedbackStatus === 'error' ? 'text-destructive' : 'text-muted-foreground',
  );

  function selectRating(nextRating: QuestionFeedbackRatingValue) {
    onRate(rating === nextRating ? null : nextRating);
  }

  return (
    <fieldset className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
      <legend className="sr-only">Rate this question</legend>
      <p className="font-medium">Was this question helpful?</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={rating === 'helpful' ? 'success' : 'outline'}
          size="icon"
          className="rounded-full"
          aria-label="Good question"
          aria-pressed={rating === 'helpful'}
          disabled={isSaving}
          onClick={() => selectRating('helpful')}
        >
          <ThumbsUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant={rating === 'not_helpful' ? 'destructive' : 'outline'}
          size="icon"
          className="rounded-full"
          aria-label="Not a good question"
          aria-pressed={rating === 'not_helpful'}
          disabled={isSaving}
          onClick={() => selectRating('not_helpful')}
        >
          <ThumbsDown aria-hidden="true" />
        </Button>
      </div>
      <output aria-live="polite" className={statusClassName}>
        {statusMessage}
      </output>
    </fieldset>
  );
}
