'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  canSubmitQuestionAnswer,
  createLoadQuestionAction,
  createSubmitSelectedAnswerAction,
  type LoadState,
  loadPreviousAttempt,
  reattemptQuestion,
} from '@/app/(app)/app/questions/[slug]/question-page-logic';
import { selectChoiceIfAllowed } from '@/app/(app)/app/shared/question-guards';
import type { QuestionMode } from '@/lib/routes';
import { useIsMounted } from '@/lib/use-is-mounted';
import { submitAnswer } from '@/src/adapters/controllers/question-controller';
import {
  type GetQuestionBySlugOutput,
  getPreviousAttempt,
  getQuestionBySlug,
} from '@/src/adapters/controllers/question-view-controller';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type UseQuestionPageControllerInput = {
  slug: string;
  mode?: QuestionMode | null;
};

export type UseQuestionPageControllerOutput = {
  loadState: LoadState;
  question: GetQuestionBySlugOutput | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  canSubmit: boolean;
  isPending: boolean;
  onTryAgain: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onReattempt: () => void;
};

export function useQuestionPageController(
  input: UseQuestionPageControllerInput,
): UseQuestionPageControllerOutput {
  const [question, setQuestion] = useState<GetQuestionBySlugOutput | null>(
    null,
  );
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitAnswerOutput | null>(
    null,
  );
  const [questionLoadedAt, setQuestionLoadedAt] = useState<number | null>(null);
  const [submitIdempotencyKey, setSubmitIdempotencyKey] = useState<
    string | null
  >(null);
  const [loadState, setLoadState] = useState<LoadState>({
    status: 'loading',
  });
  const [isPending, startTransition] = useTransition();
  const isMounted = useIsMounted();

  const loadQuestion = useMemo(
    () =>
      createLoadQuestionAction({
        slug: input.slug,
        startTransition,
        getQuestionBySlugFn: getQuestionBySlug,
        createIdempotencyKey: () => crypto.randomUUID(),
        nowMs: Date.now,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
        isMounted,
      }),
    [input.slug, isMounted],
  );

  useEffect(loadQuestion, [loadQuestion]);

  useEffect(() => {
    if (input.mode !== 'review') return;
    if (loadState.status !== 'ready') return;
    if (!question) return;

    startTransition(() => {
      void loadPreviousAttempt({
        questionId: question.questionId,
        getPreviousAttemptFn: getPreviousAttempt,
        setSelectedChoiceId,
        setSubmitResult,
        isMounted,
      });
    });
  }, [input.mode, loadState.status, question, isMounted]);

  const canSubmit = useMemo(() => {
    return canSubmitQuestionAnswer({
      loadState,
      question,
      selectedChoiceId,
      submitResult,
    });
  }, [loadState, question, selectedChoiceId, submitResult]);

  const onSelectChoice = useMemo(() => {
    return (choiceId: string) => {
      selectChoiceIfAllowed(
        { isAnswered: false, submitResult },
        setSelectedChoiceId,
        choiceId,
      );
    };
  }, [submitResult]);

  const onSubmit = useMemo(
    () =>
      createSubmitSelectedAnswerAction({
        startTransition,
        question,
        selectedChoiceId,
        questionLoadedAtMs: questionLoadedAt,
        submitIdempotencyKey,
        submitAnswerFn: submitAnswer,
        nowMs: Date.now,
        setLoadState,
        setSubmitResult,
        isMounted,
      }),
    [
      question,
      questionLoadedAt,
      selectedChoiceId,
      submitIdempotencyKey,
      isMounted,
    ],
  );

  const onReattempt = useMemo(
    () =>
      reattemptQuestion.bind(null, {
        createIdempotencyKey: () => crypto.randomUUID(),
        nowMs: Date.now,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
      }),
    [],
  );

  return {
    loadState,
    question,
    selectedChoiceId,
    submitResult,
    canSubmit,
    isPending,
    onTryAgain: loadQuestion,
    onSelectChoice,
    onSubmit,
    onReattempt,
  };
}
