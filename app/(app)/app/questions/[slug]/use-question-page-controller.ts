'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  canSubmitQuestionAnswer,
  createLoadQuestionAction,
  createSubmitSelectedAnswerAction,
  type LoadState,
  loadPreviousAttempt,
  reattemptQuestion,
  type SessionNavigation,
} from '@/app/(app)/app/questions/[slug]/question-page-logic';
import { selectChoiceIfAllowed } from '@/app/(app)/app/shared/question-guards';
import type { QuestionMode, QuestionOrigin } from '@/lib/routes';
import { useIsMounted } from '@/lib/use-is-mounted';
import { withTimeout } from '@/lib/with-timeout';
import { getPracticeSessionReview } from '@/src/adapters/controllers/practice-controller';
import { submitAnswer } from '@/src/adapters/controllers/question-controller';
import {
  type GetQuestionBySlugOutput,
  getPreviousAttempt,
  getQuestionBySlug,
} from '@/src/adapters/controllers/question-view-controller';
import type { AvailablePracticeSessionReviewRow } from '@/src/application/use-cases/get-practice-session-review';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type UseQuestionPageControllerInput = {
  slug: string;
  mode?: QuestionMode | null;
  from?: QuestionOrigin | null;
  sessionId?: string;
  attemptId?: string;
};

export type UseQuestionPageControllerOutput = {
  loadState: LoadState;
  question: GetQuestionBySlugOutput | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  sessionNavigation: SessionNavigation | null;
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
  const [sessionNavigation, setSessionNavigation] =
    useState<SessionNavigation | null>(null);
  const [isPending, startTransition] = useTransition();
  const isMounted = useIsMounted();
  const sessionQuestionsBySessionIdRef = useRef<
    Map<string, SessionNavigation['questions']>
  >(new Map());

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
    const sessionId = input.sessionId;
    if (!sessionId) {
      setSessionNavigation(null);
      return;
    }

    let isStale = false;

    const cachedQuestions =
      sessionQuestionsBySessionIdRef.current.get(sessionId) ?? null;
    if (cachedQuestions) {
      const currentIndex = cachedQuestions.findIndex(
        (q) => q.slug === input.slug,
      );
      if (currentIndex === -1) {
        setSessionNavigation(null);
        return;
      }

      setSessionNavigation({
        questions: cachedQuestions,
        currentIndex,
        sessionId,
        from: input.from ?? 'practice',
      });
      return;
    }

    setSessionNavigation(null);

    startTransition(() => {
      void withTimeout(getPracticeSessionReview({ sessionId }), 10_000)
        .then((result) => {
          if (isStale) return;
          if (!isMounted()) return;
          if (!result.ok) {
            if (process.env.NODE_ENV === 'development') {
              console.warn(
                '[SessionNavigation] Review fetch failed:',
                result.error,
              );
            }
            setSessionNavigation(null);
            return;
          }

          const questions = result.data.rows
            .filter(
              (row): row is AvailablePracticeSessionReviewRow =>
                row.isAvailable,
            )
            .map((row) => ({
              slug: row.slug,
              order: row.order,
              isCorrect: row.isCorrect,
            }));

          const currentIndex = questions.findIndex(
            (q) => q.slug === input.slug,
          );
          if (currentIndex === -1) {
            setSessionNavigation(null);
            return;
          }

          sessionQuestionsBySessionIdRef.current.set(sessionId, questions);

          setSessionNavigation({
            questions,
            currentIndex,
            sessionId,
            from: input.from ?? 'practice',
          });
        })
        .catch((error: unknown) => {
          if (isStale || !isMounted()) return;
          if (process.env.NODE_ENV === 'development') {
            console.error('[SessionNavigation] Review fetch threw:', error);
          }
          setSessionNavigation(null);
        });
    });

    return () => {
      isStale = true;
    };
  }, [input.sessionId, input.slug, input.from, isMounted]);

  useEffect(() => {
    if (input.mode !== 'review') return;
    if (loadState.status !== 'ready') return;
    if (!question) return;

    startTransition(() => {
      void loadPreviousAttempt({
        questionId: question.questionId,
        attemptId: input.attemptId,
        sessionId: input.sessionId,
        getPreviousAttemptFn: getPreviousAttempt,
        setSelectedChoiceId,
        setSubmitResult,
        isMounted,
      });
    });
  }, [
    input.mode,
    input.attemptId,
    input.sessionId,
    loadState.status,
    question,
    isMounted,
  ]);

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
    sessionNavigation,
  };
}
