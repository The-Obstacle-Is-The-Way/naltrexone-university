import { useEffect, useMemo, useRef, useState } from 'react';
import {
  reportClientError,
  shouldReportClientError,
} from '@/lib/report-client-error';
import type { QuestionOrigin } from '@/lib/routes';
import { withTimeout } from '@/lib/with-timeout';
import { getPracticeSessionReview } from '@/src/adapters/controllers/practice-controller';
import type { AvailablePracticeSessionReviewRow } from '@/src/application/use-cases/get-practice-session-review';
import { STANDARD_READ_TIMEOUT_MS } from '../../../shared/timeout-tiers';
import type { SessionNavigation } from '../question-page-logic';

const SESSION_REVIEW_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;

export type UseQuestionPageSessionNavigationInput = {
  slug: string;
  sessionId?: string | undefined;
  from?: QuestionOrigin | null | undefined;
  historySequence?: readonly string[] | null | undefined;
  historyIndex?: number | null | undefined;
  isMounted: () => boolean;
  startTransition: (fn: () => void) => void;
};

export type UseQuestionPageSessionNavigationOutput = {
  sessionNavigation: SessionNavigation | null;
  markCurrentQuestionRetried: () => void;
};

export function useQuestionPageSessionNavigation(
  input: UseQuestionPageSessionNavigationInput,
): UseQuestionPageSessionNavigationOutput {
  const [sessionNavigation, setSessionNavigation] =
    useState<SessionNavigation | null>(null);
  const latestSlugRef = useRef(input.slug);
  latestSlugRef.current = input.slug;
  const sessionQuestionsBySessionIdRef = useRef<
    Map<string, SessionNavigation['questions']>
  >(new Map());
  const isMountedRef = useRef(input.isMounted);
  isMountedRef.current = input.isMounted;
  const startTransitionRef = useRef(input.startTransition);
  startTransitionRef.current = input.startTransition;

  useEffect(() => {
    const isMounted = () => isMountedRef.current();
    const sessionId = input.sessionId;

    if (!sessionId) {
      const historySequence = input.historySequence ?? null;
      if (historySequence && historySequence.length > 0) {
        const from = input.from ?? 'history';
        const historyIndex = input.historyIndex ?? null;
        const fallbackIndex = historySequence.indexOf(input.slug);
        const currentIndex =
          historyIndex !== null &&
          historyIndex < historySequence.length &&
          historySequence[historyIndex] === input.slug
            ? historyIndex
            : fallbackIndex;

        if (currentIndex !== -1) {
          setSessionNavigation({
            questions: historySequence.map((slug, index) => ({
              slug,
              order: index + 1,
              isCorrect: null,
              wasRetried: false,
            })),
            currentIndex,
            from,
            historySequence,
          });
          return;
        }
      }

      setSessionNavigation(null);
      return;
    }

    let isStale = false;

    const cachedQuestions =
      sessionQuestionsBySessionIdRef.current.get(sessionId) ?? null;
    if (cachedQuestions) {
      const currentIndex = cachedQuestions.findIndex(
        (question) => question.slug === input.slug,
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

    startTransitionRef.current(() => {
      void withTimeout(
        getPracticeSessionReview({ sessionId }),
        SESSION_REVIEW_TIMEOUT_MS,
      )
        .then((result) => {
          if (isStale || !isMounted()) return;
          if (!result.ok) {
            if (shouldReportClientError(result.error)) {
              reportClientError(result.error, {
                component: 'UseQuestionPageModel',
                action: 'loadSessionNavigation',
              });
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
              wasRetried: false,
            }));

          const currentIndex = questions.findIndex(
            (question) => question.slug === input.slug,
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
            historySequence: null,
          });
        })
        .catch((error: unknown) => {
          if (isStale || !isMounted()) return;
          reportClientError(error, {
            component: 'UseQuestionPageModel',
            action: 'loadSessionNavigation',
          });
          setSessionNavigation(null);
        });
    });

    return () => {
      isStale = true;
    };
  }, [
    input.sessionId,
    input.slug,
    input.from,
    input.historySequence,
    input.historyIndex,
  ]);

  const markCurrentQuestionRetried = useMemo(() => {
    return () => {
      setSessionNavigation((current) => {
        if (!current) return current;
        if (
          current.currentIndex < 0 ||
          current.currentIndex >= current.questions.length
        ) {
          return current;
        }

        const questions = current.questions.map((question, index) =>
          index === current.currentIndex
            ? { ...question, wasRetried: true }
            : question,
        );

        if (current.sessionId) {
          sessionQuestionsBySessionIdRef.current.set(
            current.sessionId,
            questions,
          );
        }

        return { ...current, questions };
      });
    };
  }, []);

  return {
    sessionNavigation,
    markCurrentQuestionRetried,
  };
}
