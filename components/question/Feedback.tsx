'use client';

import { Markdown } from '@/components/markdown/Markdown';
import { cn } from '@/lib/utils';

export type FeedbackProps = {
  isCorrect: boolean;
  explanationMd: string | null;
};

export function Feedback({ isCorrect, explanationMd }: FeedbackProps) {
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
    </div>
  );
}
