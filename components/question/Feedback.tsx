'use client';

import { Markdown } from '@/components/markdown/Markdown';
import { cn } from '@/lib/utils';

export type FeedbackChoiceExplanation = {
  choiceId: string;
  displayLabel: string;
  textMd: string;
  isCorrect: boolean;
  explanationMd: string | null;
};

export type FeedbackProps = {
  isCorrect: boolean;
  explanationMd: string | null;
  choiceExplanations?: readonly FeedbackChoiceExplanation[];
};

export function Feedback({
  isCorrect,
  explanationMd,
  choiceExplanations = [],
}: FeedbackProps) {
  const visibleChoiceExplanations = choiceExplanations.filter(
    (choice) =>
      !choice.isCorrect &&
      typeof choice.explanationMd === 'string' &&
      choice.explanationMd.trim().length > 0,
  );
  const hasMissingIncorrectExplanation = choiceExplanations.some(
    (choice) =>
      !choice.isCorrect &&
      (choice.explanationMd === null ||
        choice.explanationMd.trim().length === 0),
  );
  const shouldRenderChoiceExplanations =
    !hasMissingIncorrectExplanation && visibleChoiceExplanations.length > 0;

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card p-6 shadow-sm',
        isCorrect &&
          'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20',
        !isCorrect &&
          'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20',
      )}
    >
      <div className="text-sm font-semibold text-foreground">
        {isCorrect ? 'Correct' : 'Incorrect'}
      </div>

      <div className="mt-4">
        <div className="text-sm font-medium text-foreground">Explanation</div>
        {explanationMd ? (
          <Markdown content={explanationMd} className="mt-2 text-sm" />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Explanation not available.
          </p>
        )}
      </div>

      {shouldRenderChoiceExplanations ? (
        <div className="mt-4">
          <div className="text-sm font-medium text-foreground">
            Why other answers are wrong:
          </div>
          <div className="mt-2 space-y-3">
            {visibleChoiceExplanations.map((choice) => (
              <div
                key={choice.choiceId}
                className="rounded-xl border border-border/60 bg-background/50 p-3"
              >
                <div className="text-sm font-medium text-foreground">
                  {choice.displayLabel}) {choice.textMd}
                </div>
                <Markdown
                  content={choice.explanationMd ?? ''}
                  className="mt-2 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
