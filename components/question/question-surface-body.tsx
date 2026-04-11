'use client';

import type { ReactNode, RefObject } from 'react';
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
  onSelectChoice: (choiceId: string) => void;
  feedback?: FeedbackProps | null;
  feedbackRef?: RefObject<HTMLDivElement | null>;
  beforeQuestionCard?: ReactNode;
};

export function QuestionSurfaceBody({
  question,
  selectedChoiceId,
  correctChoiceId,
  disabled,
  onSelectChoice,
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
      onSelectChoice={onSelectChoice}
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
