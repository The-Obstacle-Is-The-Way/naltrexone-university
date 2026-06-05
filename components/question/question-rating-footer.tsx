'use client';

import {
  QuestionFeedbackRating,
  type QuestionFeedbackRatingProps,
} from './question-feedback-rating';

export type QuestionRatingFooterProps = QuestionFeedbackRatingProps;

export function QuestionRatingFooter(props: QuestionRatingFooterProps) {
  return (
    <div
      className="border-t border-border pt-4"
      data-testid="question-rating-footer"
    >
      <div
        className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground"
        data-testid="question-rating-footer-content"
      >
        <QuestionFeedbackRating {...props} />
      </div>
    </div>
  );
}
