'use client';

import { useId } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import { Card } from '@/components/ui/card';
import { ChoiceButton } from './choice-button';

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
  const choiceGroupName = useId();

  return (
    <Card>
      <Markdown content={stemMd} className="text-base text-foreground" />

      <fieldset className="mt-8 space-y-3">
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
              onClick={() => onSelectChoice(choice.id)}
            />
          );
        })}
      </fieldset>
    </Card>
  );
}
