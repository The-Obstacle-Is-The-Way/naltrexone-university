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
        'w-full rounded-xl border border-border bg-background p-4 text-left shadow-sm transition-colors hover:bg-muted focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
        disabled && 'cursor-not-allowed opacity-60',
        selected && correctness === null && 'border-orange-500',
        correctness === 'correct' &&
          'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20',
        correctness === 'incorrect' &&
          'border-red-500 bg-red-50 dark:bg-red-950/20',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={selected}
        onChange={() => onClick()}
        disabled={disabled}
        className="sr-only"
      />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-foreground',
            selected && correctness === null && 'border-orange-500',
            correctness === 'correct' && 'border-emerald-500 text-emerald-700',
            correctness === 'incorrect' && 'border-red-500 text-red-700',
          )}
        >
          {label}
        </div>
        <Markdown content={textMd} className="text-sm text-foreground" />
      </div>
    </label>
  );
}
