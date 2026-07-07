'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Markdown } from '@/components/markdown/markdown';
import { cn } from '@/lib/utils';
import type { ChoiceSelectionOrigin } from './choice-selection';

export type ChoiceButtonProps = {
  name: string;
  label: string;
  textMd: string;
  selected: boolean;
  disabled?: boolean;
  correctness?: 'correct' | 'incorrect' | 'wrong-unselected' | null;
  onClick: (origin: ChoiceSelectionOrigin) => void;
};

const RADIO_KEYBOARD_SELECTION_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  ' ',
]);

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
  const pointerActivationArmedRef = useRef(false);
  const pointerActivationTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const hasVerdict = correctness === 'correct' || correctness === 'incorrect';

  const clearPointerActivation = useCallback(() => {
    pointerActivationArmedRef.current = false;
    if (pointerActivationTimeoutRef.current) {
      clearTimeout(pointerActivationTimeoutRef.current);
      pointerActivationTimeoutRef.current = null;
    }
  }, []);

  function armPointerActivation() {
    clearPointerActivation();
    pointerActivationArmedRef.current = true;
  }

  function schedulePointerActivationClear() {
    if (pointerActivationTimeoutRef.current) {
      clearTimeout(pointerActivationTimeoutRef.current);
    }
    pointerActivationTimeoutRef.current = setTimeout(clearPointerActivation, 0);
  }

  useEffect(() => clearPointerActivation, [clearPointerActivation]);

  return (
    <label
      onPointerDownCapture={() => {
        if (!disabled) armPointerActivation();
      }}
      onPointerCancelCapture={clearPointerActivation}
      onPointerLeave={(event) => {
        if (event.buttons !== 0) clearPointerActivation();
      }}
      onClickCapture={() => {
        if (pointerActivationArmedRef.current) schedulePointerActivationClear();
      }}
      onKeyDownCapture={(event) => {
        if (RADIO_KEYBOARD_SELECTION_KEYS.has(event.key)) {
          clearPointerActivation();
        }
      }}
      className={cn(
        'block w-full rounded-xl border border-foreground/50 bg-background/50 p-4 text-left shadow-sm transition-colors focus-within:border-ring ring-focus-within',
        !hasVerdict &&
          !selected &&
          'dark:border-foreground/40 dark:bg-background/50',
        !disabled && 'cursor-pointer',
        !disabled &&
          !selected &&
          'hover:border-foreground/55 hover:bg-foreground/[0.06] dark:hover:border-foreground/50 dark:hover:bg-foreground/[0.05]',
        disabled && 'cursor-not-allowed',
        disabled && !correctness && 'opacity-50',
        selected &&
          correctness === null &&
          'border-ring bg-foreground/[0.08] dark:border-foreground/70 dark:bg-foreground/[0.12]',
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
        onChange={() => {
          const origin: ChoiceSelectionOrigin =
            pointerActivationArmedRef.current ? 'pointer' : 'non-pointer';
          clearPointerActivation();
          onClick(origin);
        }}
        disabled={disabled}
        className="sr-only"
      />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-foreground/20 bg-foreground/[0.06] text-xs font-semibold leading-none text-foreground',
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
