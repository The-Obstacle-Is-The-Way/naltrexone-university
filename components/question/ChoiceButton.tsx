'use client';

import { Markdown } from '@/components/markdown/Markdown';
import { cn } from '@/lib/utils';

export type ChoiceButtonProps = {
  name: string;
  label: string;
  textMd: string;
  selected: boolean;
  disabled?: boolean;
  correctness?: 'correct' | 'incorrect' | null;
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
  return (
    <label
      className={cn(
        'block w-full rounded-xl border border-border bg-background p-4 text-left shadow-sm transition-colors focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
        !disabled && 'cursor-pointer hover:bg-muted',
        disabled && 'cursor-not-allowed opacity-60',
        selected && correctness === null && 'border-ring',
        correctness === 'correct' &&
          'border-success bg-success/10 text-success-foreground',
        correctness === 'incorrect' &&
          'border-destructive bg-destructive/10 text-destructive',
      )}
    >
      <input
        type="radio"
        name={name}
        aria-label={`Choice ${label}`}
        checked={selected}
        onChange={() => onClick()}
        disabled={disabled}
        className="sr-only"
      />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold leading-none text-foreground',
            selected && correctness === null && 'border-ring',
            correctness === 'correct' &&
              'border-success bg-success/15 text-success',
            correctness === 'incorrect' &&
              'border-destructive bg-destructive/15 text-destructive',
          )}
        >
          {label}
        </div>
        <Markdown content={textMd} className="text-sm text-foreground" />
      </div>
    </label>
  );
}
