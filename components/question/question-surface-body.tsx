'use client';

import type { ReactNode, RefObject } from 'react';
import type { ChoiceSelectionOrigin } from './choice-selection';
import { Feedback, type FeedbackProps } from './feedback';
import { QuestionCard, type QuestionCardChoice } from './question-card';

type QuestionSurfaceBodyQuestion = {
  stemMd: string;
  choices: ReadonlyArray<QuestionCardChoice>;
};

export type QuestionSurfaceBodyProps = {
  question: QuestionSurfaceBodyQuestion | null;
  selectedChoiceId: string | null;
  correctChoiceId: string | null;
  disabled: boolean;
  canSubmitSelectedChoice?: boolean;
  onSelectChoice: (choiceId: string, origin?: ChoiceSelectionOrigin) => void;
  onSubmitSelectedChoice?: (() => void) | undefined;
  feedback?: FeedbackProps | null;
  feedbackRef?: RefObject<HTMLDivElement | null>;
  beforeQuestionCard?: ReactNode;
};

export function QuestionSurfaceBody({
  question,
  selectedChoiceId,
  correctChoiceId,
  disabled,
  canSubmitSelectedChoice = false,
  onSelectChoice,
  onSubmitSelectedChoice,
  feedback = null,
  feedbackRef,
  beforeQuestionCard,
}: QuestionSurfaceBodyProps) {
  const questionCard = question ? (
    <QuestionCard
      stemMd={question.stemMd}
      choices={question.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        textMd: choice.textMd,
      }))}
      selectedChoiceId={selectedChoiceId}
      correctChoiceId={correctChoiceId}
      disabled={disabled}
      canSubmitSelectedChoice={canSubmitSelectedChoice}
      onSelectChoice={onSelectChoice}
      onSubmitSelectedChoice={onSubmitSelectedChoice}
    />
  ) : null;

  const feedbackCard = feedback ? (
    <Feedback {...feedback} selectedChoiceId={selectedChoiceId} />
  ) : null;

  return (
    <>
      {question ? beforeQuestionCard : null}
      {questionCard}
      {feedbackRef && feedbackCard ? (
        <div ref={feedbackRef}>{feedbackCard}</div>
      ) : (
        feedbackCard
      )}
    </>
  );
}
