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
        'block w-full rounded-xl border border-foreground/50 bg-foreground/5 p-4 text-left shadow-sm transition-colors focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
        !hasVerdict &&
          !selected &&
          'dark:border-foreground/40 dark:bg-foreground/5',
        !disabled && 'cursor-pointer',
        !disabled &&
          !selected &&
          'hover:border-foreground/55 hover:bg-foreground/[0.08] dark:hover:border-foreground/55 dark:hover:bg-foreground/8',
        disabled && 'cursor-not-allowed',
        disabled && !correctness && 'opacity-50',
        selected &&
          correctness === null &&
          'border-ring bg-foreground/[0.12] dark:border-foreground/70 dark:bg-foreground/15',
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
