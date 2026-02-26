'use client';

import { Markdown } from '@/components/markdown/Markdown';
import { Card } from '@/components/ui/card';
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
  referenceMd?: string | null;
  choiceExplanations?: readonly FeedbackChoiceExplanation[];
  selectedChoiceId?: string | null;
};

export function Feedback({
  isCorrect,
  explanationMd,
  referenceMd,
  choiceExplanations = [],
  selectedChoiceId = null,
}: FeedbackProps) {
  const correctChoice =
    choiceExplanations.find((choice) => choice.isCorrect) ?? null;
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
    <Card role="status">
      <span
        className={cn(
          'inline-flex rounded-full px-3 py-1 text-sm font-semibold',
          isCorrect && 'bg-success/15 text-success',
          !isCorrect && 'bg-destructive/15 text-destructive',
        )}
      >
        {isCorrect ? 'Correct' : 'Incorrect'}
      </span>

      <div className="mt-6">
        {correctChoice ? (
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">
              Correct answer
            </div>
            <div className="flex items-start gap-1 text-sm text-foreground">
              <span className="shrink-0 font-medium">
                {correctChoice.displayLabel})
              </span>
              <Markdown content={correctChoice.textMd} />
            </div>
          </div>
        ) : (
          <div className="text-sm font-medium text-foreground">Explanation</div>
        )}
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
                <div className="flex items-start gap-1 text-sm text-muted-foreground">
                  <span className="shrink-0">{choice.displayLabel})</span>
                  {choice.choiceId === selectedChoiceId ? (
                    <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      Your answer
                    </span>
                  ) : null}
                  <Markdown content={choice.textMd} />
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

      {referenceMd ? (
        <div className="mt-4 border-t border-border/40 pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reference
          </div>
          <Markdown content={referenceMd} className="mt-1 text-xs" />
        </div>
      ) : null}
    </Card>
  );
}
