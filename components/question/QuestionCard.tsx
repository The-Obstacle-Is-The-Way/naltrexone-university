'use client';

import { Markdown } from '@/components/markdown/Markdown';
import { ChoiceButton } from './ChoiceButton';

export type QuestionCardChoice = {
  id: string;
  label: string;
  textMd: string;
};

export type QuestionCardProps = {
  stemMd: string;
  choices: readonly QuestionCardChoice[];
  selectedChoiceId: string | null;
  correctChoiceId: string | null;
  disabled?: boolean;
  onSelectChoice: (choiceId: string) => void;
};

export function QuestionCard({
  stemMd,
  choices,
  selectedChoiceId,
  correctChoiceId,
  disabled = false,
  onSelectChoice,
}: QuestionCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <Markdown content={stemMd} className="text-sm text-foreground" />

      <div className="mt-6 space-y-3">
        {choices.map((choice) => {
          const selected = selectedChoiceId === choice.id;
          const correctness =
            correctChoiceId === null
              ? null
              : choice.id === correctChoiceId
                ? 'correct'
                : selected
                  ? 'incorrect'
                  : null;

          return (
            <ChoiceButton
              key={choice.id}
              label={choice.label}
              textMd={choice.textMd}
              selected={selected}
              correctness={correctness}
              disabled={disabled || correctChoiceId !== null}
              onClick={() => onSelectChoice(choice.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
