'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  canReattemptInContext,
  canSubmitQuestionAnswer,
  createLoadQuestionAction,
  createSubmitSelectedAnswerAction,
  type LoadState,
  loadPreviousAttempt,
  reattemptQuestion,
  type SessionNavigation,
  type SessionUnansweredReveal,
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

const SESSION_REVIEW_TIMEOUT_MS = 10_000;

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
  sessionUnansweredReveal: SessionUnansweredReveal | null;
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
  const [sessionUnansweredReveal, setSessionUnansweredReveal] =
    useState<SessionUnansweredReveal | null>(null);
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
        setSessionUnansweredReveal,
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
      void withTimeout(
        getPracticeSessionReview({ sessionId }),
        SESSION_REVIEW_TIMEOUT_MS,
      )
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
        setSessionUnansweredReveal,
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
      mode: input.mode,
      sessionId: input.sessionId,
    });
  }, [
    loadState,
    question,
    selectedChoiceId,
    submitResult,
    input.mode,
    input.sessionId,
  ]);

  const onSelectChoice = useMemo(() => {
    return (choiceId: string) => {
      selectChoiceIfAllowed(
        { isAnswered: sessionUnansweredReveal !== null, submitResult },
        setSelectedChoiceId,
        choiceId,
      );
    };
  }, [sessionUnansweredReveal, submitResult]);

  const onSubmit = useMemo(
    () =>
      createSubmitSelectedAnswerAction({
        startTransition,
        question,
        selectedChoiceId,
        mode: input.mode,
        sessionId: input.sessionId,
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
      input.mode,
      input.sessionId,
      isMounted,
    ],
  );

  const onReattempt = useMemo(() => {
    const canReattempt = canReattemptInContext({
      mode: input.mode,
      sessionId: input.sessionId,
    });
    if (!canReattempt) {
      return () => undefined;
    }
    return reattemptQuestion.bind(null, {
      createIdempotencyKey: () => crypto.randomUUID(),
      nowMs: Date.now,
      setSelectedChoiceId,
      setSubmitResult,
      setSubmitIdempotencyKey,
      setQuestionLoadedAt,
      setSessionUnansweredReveal,
    });
  }, [input.mode, input.sessionId]);

  return {
    loadState,
    question,
    selectedChoiceId,
    submitResult,
    sessionUnansweredReveal,
    canSubmit,
    isPending,
    onTryAgain: loadQuestion,
    onSelectChoice,
    onSubmit,
    onReattempt,
    sessionNavigation,
  };
}
