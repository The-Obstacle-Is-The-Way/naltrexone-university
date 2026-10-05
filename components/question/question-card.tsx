'use client';

import { useId } from 'react';
import { Markdown } from '@/components/markdown/markdown';
import { Card } from '@/components/ui/card';
import type { UngradedReason } from '@/src/domain/services';
import { ChoiceButton } from './choice-button';
import type { ChoiceSelectionOrigin } from './choice-selection';
import { KEY_NAME, YOUR_ANSWER } from './ungraded-review';

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
  /**
   * A review no score counts (ADR-022 Amendment 2026-10-05): the choices are
   * shown ungraded, and the learner's choice and the key are named in words.
   */
  ungraded?: UngradedReason | null;
  disabled?: boolean;
  canSubmitSelectedChoice?: boolean;
  onSelectChoice: (choiceId: string, origin: ChoiceSelectionOrigin) => void;
  onSubmitSelectedChoice?: (() => void) | undefined;
};

export function QuestionCard({
  stemMd,
  choices,
  selectedChoiceId,
  correctChoiceId,
  ungraded = null,
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
          // Only commit for Enter on the radios themselves. Choice markdown
          // can contain focusable content (links); Enter there must keep its
          // native behavior instead of grading the answer.
          if (
            !(event.target instanceof HTMLInputElement) ||
            event.target.type !== 'radio'
          ) {
            return;
          }

          event.preventDefault();
          onSubmitSelectedChoice();
        }}
      >
        <legend className="sr-only">Answer choices</legend>
        {choices.map((choice) => {
          const selected = selectedChoiceId === choice.id;
          const keyed = choice.id === correctChoiceId;
          const correctness =
            correctChoiceId === null
              ? null
              : ungraded
                ? 'ungraded'
                : keyed
                  ? 'correct'
                  : selected
                    ? 'incorrect'
                    : 'wrong-unselected';
          const notes =
            ungraded && correctChoiceId !== null
              ? [
                  ...(selected ? [YOUR_ANSWER] : []),
                  ...(keyed ? [KEY_NAME[ungraded]] : []),
                ]
              : [];

          return (
            <ChoiceButton
              key={choice.id}
              name={choiceGroupName}
              label={choice.label}
              textMd={choice.textMd}
              selected={selected}
              correctness={correctness}
              note={notes.length > 0 ? notes.join(' · ') : null}
              disabled={disabled || correctChoiceId !== null}
              onClick={(origin) => onSelectChoice(choice.id, origin)}
            />
          );
        })}
      </fieldset>
    </Card>
  );
}
