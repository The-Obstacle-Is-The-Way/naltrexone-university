'use client';

import { useId } from 'react';
import { Markdown } from '@/components/markdown/markdown';
import { Card } from '@/components/ui/card';
import { ChoiceButton } from './choice-button';
import type { ChoiceSelectionOrigin } from './choice-selection';

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
  canSubmitSelectedChoice?: boolean;
  onSelectChoice: (choiceId: string, origin?: ChoiceSelectionOrigin) => void;
  onSubmitSelectedChoice?: (() => void) | undefined;
};

export function QuestionCard({
  stemMd,
  choices,
  selectedChoiceId,
  correctChoiceId,
  disabled = false,
  canSubmitSelectedChoice = false,
  onSelectChoice,
  onSubmitSelectedChoice,
}: QuestionCardProps) {
  const choiceGroupName = useId();

  return (
    <Card>
      <Markdown content={stemMd} className="text-base text-foreground" />

      <fieldset
        className="mt-8 space-y-3"
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          if (!canSubmitSelectedChoice || !onSubmitSelectedChoice) return;

          event.preventDefault();
          onSubmitSelectedChoice();
        }}
      >
        <legend className="sr-only">Answer choices</legend>
        {choices.map((choice) => {
          const selected = selectedChoiceId === choice.id;
          const correctness =
            correctChoiceId === null
              ? null
              : choice.id === correctChoiceId
                ? 'correct'
                : selected
                  ? 'incorrect'
                  : 'wrong-unselected';

          return (
            <ChoiceButton
              key={choice.id}
              name={choiceGroupName}
              label={choice.label}
              textMd={choice.textMd}
              selected={selected}
              correctness={correctness}
              disabled={disabled || correctChoiceId !== null}
              onClick={(origin) => onSelectChoice(choice.id, origin)}
            />
          );
        })}
      </fieldset>
    </Card>
  );
}
