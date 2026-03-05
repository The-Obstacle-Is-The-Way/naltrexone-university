'use client';

import { Markdown } from '@/components/markdown/Markdown';
import { cn } from '@/lib/utils';

export type ChoiceButtonProps = {
  name: string;
  label: string;
  textMd: string;
  selected: boolean;
  disabled?: boolean;
  correctness?: 'correct' | 'incorrect' | 'wrong-unselected' | null;
  onClick: () => void;
};

export function ChoiceButton({
  name,
  label,
  textMd,
  selected,
  disabled = false,
  correctness = null,
  onClick,
}: ChoiceButtonProps) {
  const choiceTextClassName = 'text-base text-foreground';

  const hasVerdict = correctness === 'correct' || correctness === 'incorrect';

  return (
    <label
      className={cn(
        'block w-full rounded-xl border border-border/60 bg-muted/20 p-4 text-left shadow-sm transition-colors focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
        !hasVerdict && 'dark:border-foreground/40 dark:bg-foreground/40',
        !disabled && 'cursor-pointer hover:bg-muted/40',
        !disabled &&
          !selected &&
          'hover:border-muted-foreground/30 dark:hover:border-foreground/70',
        disabled && 'cursor-not-allowed',
        disabled && !correctness && 'opacity-50',
        selected &&
          correctness === null &&
          'border-ring bg-muted/40 dark:border-foreground/70 dark:bg-foreground/40',
        correctness === 'correct' &&
          'border-success bg-success/10 text-success',
        correctness === 'incorrect' &&
          'border-destructive bg-destructive/10 text-destructive',
      )}
    >
      <input
        type="radio"
        name={name}
        value={label}
        checked={selected}
        onChange={() => onClick()}
        disabled={disabled}
        className="sr-only"
      />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold leading-none text-foreground',
            !hasVerdict && 'dark:border-foreground/60 dark:bg-foreground/20',
            selected && correctness === null && 'border-ring',
            correctness === 'correct' &&
              'border-success bg-success/15 text-success',
            correctness === 'incorrect' &&
              'border-destructive bg-destructive/15 text-destructive',
          )}
        >
          {label}
        </div>
        <Markdown content={textMd} className={choiceTextClassName} />
      </div>
    </label>
  );
}
