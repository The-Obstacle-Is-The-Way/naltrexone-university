'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  canSubmitQuestionAnswer,
  createLoadQuestionAction,
  createSubmitSelectedAnswerAction,
  type LoadState,
  loadPreviousAttempt,
  normalizeReviewIdentifiers,
  type RetryProvenance,
  type ReviewHydrationState,
  reattemptQuestion,
  type SessionNavigation,
  type SessionUnansweredReveal,
} from '@/app/(app)/app/questions/[slug]/question-page-logic';
import { toggleBookmarkForQuestion } from '@/app/(app)/app/shared/bookmark-toggle';
import { selectChoiceIfAllowed } from '@/app/(app)/app/shared/question-guards';
import {
  reportClientError,
  shouldReportClientError,
} from '@/lib/report-client-error';
import type { QuestionMode, QuestionOrigin } from '@/lib/routes';
import { useIsMounted } from '@/lib/use-is-mounted';
import { withTimeout } from '@/lib/with-timeout';
import {
  getBookmarks,
  toggleBookmark,
} from '@/src/adapters/controllers/bookmark-controller';
import { getPracticeSessionReview } from '@/src/adapters/controllers/practice-controller';
import { submitAnswer } from '@/src/adapters/controllers/question-controller';
import {
  type GetQuestionBySlugOutput,
  getPreviousAttempt,
  getQuestionBySlug,
} from '@/src/adapters/controllers/question-view-controller';
import type { AvailablePracticeSessionReviewRow } from '@/src/application/use-cases/get-practice-session-review';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import type { AttemptRetryOrigin } from '@/src/domain/entities';

const SESSION_REVIEW_TIMEOUT_MS = 10_000;
const BOOKMARK_LOOKUP_TIMEOUT_MS = 10_000;

export type QuestionPageBookmarkStatus =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'error';

function resolveRetryOrigin(input: {
  mode?: QuestionMode | null;
  sessionId?: string;
  from?: QuestionOrigin | null;
}): AttemptRetryOrigin {
  if (input.mode === 'review' && input.sessionId) return 'session_review';
  if (input.from === 'history') return 'history';
  if (input.from === 'dashboard') return 'dashboard';
  if (input.from === 'bookmarks') return 'bookmarks';
  return 'other';
}

export type UseQuestionPageControllerInput = {
  slug: string;
  mode?: QuestionMode | null;
  from?: QuestionOrigin | null;
  sessionId?: string;
  attemptId?: string;
  historySequence?: readonly string[] | null;
  historyIndex?: number | null;
};

export type UseQuestionPageControllerOutput = {
  loadState: LoadState;
  question: GetQuestionBySlugOutput | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  isLoadingPreviousAttempt: boolean;
  reviewHydrationState: ReviewHydrationState | null;
  sessionUnansweredReveal: SessionUnansweredReveal | null;
  sessionNavigation: SessionNavigation | null;
  canSubmit: boolean;
  isPending: boolean;
  bookmarkStatus: QuestionPageBookmarkStatus;
  isBookmarkHydrated: boolean;
  isBookmarked: boolean;
  onTryAgain: () => void;
  onToggleBookmark: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onReattempt: () => void;
  onAnswerAsNew: () => void;
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
  const [isLoadingPreviousAttempt, setIsLoadingPreviousAttempt] = useState(
    input.mode === 'review',
  );
  const [reviewHydrationState, setReviewHydrationState] =
    useState<ReviewHydrationState | null>(
      input.mode === 'review' ? 'no_prior_attempt' : null,
    );
  const [pendingRetryProvenance, setPendingRetryProvenance] =
    useState<RetryProvenance | null>(null);
  const [bookmarkedQuestionIds, setBookmarkedQuestionIds] = useState<
    Set<string>
  >(() => new Set());
  const [bookmarkUiState, setBookmarkUiState] = useState<{
    questionId: string | null;
    status: QuestionPageBookmarkStatus;
    isHydrated: boolean;
  }>({
    questionId: null,
    status: input.mode === 'review' ? 'loading' : 'idle',
    isHydrated: false,
  });
  const [isPending, startTransition] = useTransition();
  const isMounted = useIsMounted();
  const latestSlugRef = useRef(input.slug);
  latestSlugRef.current = input.slug;
  const latestLoadQuestionRequestId = useRef(0);
  const latestPreviousAttemptRequestId = useRef(0);
  const activePreviousAttemptRequestId = useRef<number | null>(null);
  const latestSubmitRequestId = useRef(0);
  const latestBookmarkLookupRequestId = useRef(0);
  const bookmarkStateVersionRef = useRef(0);
  const bookmarkIdempotencyKeysRef = useRef<Map<string, string>>(new Map());
  const sessionQuestionsBySessionIdRef = useRef<
    Map<string, SessionNavigation['questions']>
  >(new Map());
  const normalizedReviewIds = useMemo(
    () =>
      normalizeReviewIdentifiers({
        mode: input.mode,
        sessionId: input.sessionId,
        attemptId: input.attemptId,
      }),
    [input.mode, input.sessionId, input.attemptId],
  );
  const normalizedSessionId = normalizedReviewIds.sessionId;
  const normalizedAttemptId = normalizedReviewIds.attemptId;

  const loadQuestion = useMemo(
    () => () => {
      latestLoadQuestionRequestId.current += 1;
      const requestId = latestLoadQuestionRequestId.current;
      const requestSlug = input.slug;

      const runLoadQuestion = createLoadQuestionAction({
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
        isStale: () =>
          latestLoadQuestionRequestId.current !== requestId ||
          latestSlugRef.current !== requestSlug,
      });

      runLoadQuestion();
    },
    [input.slug, isMounted],
  );

  useEffect(loadQuestion, [loadQuestion]);

  useEffect(() => {
    if (!input.slug) return;
    setPendingRetryProvenance(null);
  }, [input.slug]);

  useEffect(() => {
    if (!normalizedReviewIds.normalized) return;
    if (process.env.NODE_ENV !== 'development') return;

    console.warn(
      '[QuestionPage] Normalized mixed review params by preferring sessionId over attemptId',
      {
        slug: input.slug,
        sessionId: input.sessionId,
        attemptId: input.attemptId,
      },
    );
  }, [
    normalizedReviewIds.normalized,
    input.slug,
    input.sessionId,
    input.attemptId,
  ]);

  useEffect(() => {
    const sessionId = normalizedSessionId;
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
            if (shouldReportClientError(result.error)) {
              reportClientError(result.error, {
                component: 'UseQuestionPageController',
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
            historySequence: null,
          });
        })
        .catch((error: unknown) => {
          if (isStale || !isMounted()) return;
          reportClientError(error, {
            component: 'UseQuestionPageController',
            action: 'loadSessionNavigation',
          });
          setSessionNavigation(null);
        });
    });

    return () => {
      isStale = true;
    };
  }, [
    normalizedSessionId,
    input.slug,
    input.from,
    input.historySequence,
    input.historyIndex,
    isMounted,
  ]);

  useEffect(() => {
    if (input.mode === 'review') {
      setIsLoadingPreviousAttempt(true);
      setReviewHydrationState('no_prior_attempt');
      return;
    }

    setIsLoadingPreviousAttempt(false);
    setReviewHydrationState(null);
  }, [input.mode]);

  useEffect(() => {
    latestPreviousAttemptRequestId.current += 1;
    const requestId = latestPreviousAttemptRequestId.current;
    const requestSlug = latestSlugRef.current;
    const clearPreviousAttemptLoadingIfActive = () => {
      if (activePreviousAttemptRequestId.current === null) return;
      activePreviousAttemptRequestId.current = null;
      if (isMounted()) {
        setIsLoadingPreviousAttempt(false);
      }
    };

    if (input.mode !== 'review') {
      clearPreviousAttemptLoadingIfActive();
      return;
    }
    if (loadState.status !== 'ready') {
      clearPreviousAttemptLoadingIfActive();
      return;
    }
    if (!question) {
      clearPreviousAttemptLoadingIfActive();
      if (isMounted()) {
        setIsLoadingPreviousAttempt(false);
        setReviewHydrationState('no_prior_attempt');
      }
      return;
    }

    activePreviousAttemptRequestId.current = requestId;
    setIsLoadingPreviousAttempt(true);
    setReviewHydrationState('no_prior_attempt');

    startTransition(() => {
      void loadPreviousAttempt({
        questionId: question.questionId,
        attemptId: normalizedAttemptId,
        sessionId: normalizedSessionId,
        getPreviousAttemptFn: getPreviousAttempt,
        setSelectedChoiceId,
        setSubmitResult,
        setSessionUnansweredReveal,
        setReviewHydrationState,
        isMounted,
        isStale: () =>
          latestPreviousAttemptRequestId.current !== requestId ||
          latestSlugRef.current !== requestSlug,
      }).finally(() => {
        if (!isMounted()) return;
        if (latestPreviousAttemptRequestId.current !== requestId) return;
        if (latestSlugRef.current !== requestSlug) return;
        if (activePreviousAttemptRequestId.current !== requestId) return;
        activePreviousAttemptRequestId.current = null;
        setIsLoadingPreviousAttempt(false);
      });
    });
  }, [
    input.mode,
    normalizedAttemptId,
    normalizedSessionId,
    loadState.status,
    question,
    isMounted,
  ]);

  useEffect(() => {
    if (input.mode !== 'review' || !question) {
      setBookmarkUiState((current) => {
        if (
          current.questionId === null &&
          current.status === 'idle' &&
          current.isHydrated === false
        ) {
          return current;
        }

        return {
          questionId: null,
          status: 'idle',
          isHydrated: false,
        };
      });
      return;
    }

    latestBookmarkLookupRequestId.current += 1;
    const requestId = latestBookmarkLookupRequestId.current;
    const questionId = question.questionId;
    bookmarkStateVersionRef.current += 1;
    const stateVersion = bookmarkStateVersionRef.current;

    setBookmarkUiState({
      questionId,
      status: 'loading',
      isHydrated: false,
    });
    setBookmarkedQuestionIds((prev) => {
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });

    void withTimeout(getBookmarks({}), BOOKMARK_LOOKUP_TIMEOUT_MS)
      .then((result) => {
        if (!isMounted()) return;
        if (latestBookmarkLookupRequestId.current !== requestId) return;
        if (bookmarkStateVersionRef.current !== stateVersion) return;

        if (!result.ok) {
          if (shouldReportClientError(result.error)) {
            reportClientError(result.error, {
              component: 'UseQuestionPageController',
              action: 'loadBookmarkState',
            });
          }
          setBookmarkUiState({
            questionId,
            status: 'error',
            isHydrated: false,
          });
          return;
        }

        const isQuestionBookmarked = result.data.rows.some(
          (row) => row.questionId === questionId,
        );

        setBookmarkedQuestionIds((prev) => {
          const next = new Set(prev);
          next.delete(questionId);
          if (isQuestionBookmarked) {
            next.add(questionId);
          }
          return next;
        });
        setBookmarkUiState({
          questionId,
          status: 'idle',
          isHydrated: true,
        });
      })
      .catch((error: unknown) => {
        if (!isMounted()) return;
        if (latestBookmarkLookupRequestId.current !== requestId) return;
        if (bookmarkStateVersionRef.current !== stateVersion) return;
        reportClientError(error, {
          component: 'UseQuestionPageController',
          action: 'loadBookmarkState',
        });
        setBookmarkUiState({
          questionId,
          status: 'error',
          isHydrated: false,
        });
      });
  }, [input.mode, question, isMounted]);

  const isBookmarked = question
    ? bookmarkedQuestionIds.has(question.questionId)
    : false;
  const bookmarkStatus =
    input.mode === 'review' && question
      ? bookmarkUiState.questionId === question.questionId
        ? bookmarkUiState.status
        : 'loading'
      : 'idle';
  const isBookmarkHydrated =
    input.mode === 'review' &&
    question !== null &&
    bookmarkUiState.questionId === question.questionId &&
    bookmarkUiState.isHydrated;

  const canSubmit = useMemo(() => {
    return canSubmitQuestionAnswer({
      loadState,
      question,
      selectedChoiceId,
      submitResult,
      mode: input.mode,
      sessionId: normalizedSessionId,
    });
  }, [
    loadState,
    question,
    selectedChoiceId,
    submitResult,
    input.mode,
    normalizedSessionId,
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

  const onToggleBookmark = useMemo(() => {
    return () => {
      if (!question) return;

      bookmarkStateVersionRef.current += 1;
      const stateVersion = bookmarkStateVersionRef.current;
      const questionId = question.questionId;

      void toggleBookmarkForQuestion({
        question,
        bookmarkIdempotencyKey:
          bookmarkIdempotencyKeysRef.current.get(questionId) ?? null,
        createIdempotencyKey: () => crypto.randomUUID(),
        setBookmarkIdempotencyKey: (key) => {
          bookmarkIdempotencyKeysRef.current.set(questionId, key);
        },
        toggleBookmarkFn: toggleBookmark,
        setBookmarkStatus: (status) => {
          if (!isMounted()) return;
          if (bookmarkStateVersionRef.current !== stateVersion) return;

          setBookmarkUiState({
            questionId,
            status: status === 'loading' ? 'saving' : status,
            isHydrated: true,
          });
        },
        setBookmarkedQuestionIds,
        logError: (_message: string, error: unknown) => {
          reportClientError(error, {
            component: 'UseQuestionPageController',
            action: 'toggleBookmark',
          });
        },
        isMounted,
      });
    };
  }, [question, isMounted]);

  const onSubmit = useMemo(
    () => () => {
      latestSubmitRequestId.current += 1;
      const requestId = latestSubmitRequestId.current;
      const requestSlug = input.slug;

      const runSubmit = createSubmitSelectedAnswerAction({
        startTransition,
        question,
        selectedChoiceId,
        mode: input.mode,
        sessionId: normalizedSessionId,
        questionLoadedAtMs: questionLoadedAt,
        submitIdempotencyKey,
        retryProvenance: pendingRetryProvenance,
        submitAnswerFn: submitAnswer,
        nowMs: Date.now,
        setLoadState,
        setSubmitResult,
        onUnhandledError: (error) => {
          reportClientError(error, {
            component: 'UseQuestionPageController',
            action: 'submitAnswer',
          });
        },
        isMounted,
        isStale: () =>
          latestSubmitRequestId.current !== requestId ||
          latestSlugRef.current !== requestSlug,
      });

      void runSubmit();
    },
    [
      input.slug,
      question,
      questionLoadedAt,
      selectedChoiceId,
      submitIdempotencyKey,
      input.mode,
      normalizedSessionId,
      pendingRetryProvenance,
      isMounted,
    ],
  );

  const onReattempt = useMemo(() => {
    return () => {
      const retryOrigin = resolveRetryOrigin({
        mode: input.mode,
        sessionId: normalizedSessionId,
        from: input.from,
      });
      const retryProvenance: RetryProvenance = {
        retryOfAttemptId: submitResult?.attemptId ?? null,
        retryOrigin,
        retrySessionId:
          retryOrigin === 'session_review'
            ? (normalizedSessionId ?? null)
            : null,
      };

      reattemptQuestion({
        createIdempotencyKey: () => crypto.randomUUID(),
        nowMs: Date.now,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setSessionUnansweredReveal,
        setRetryProvenance: setPendingRetryProvenance,
        retryProvenance,
      });
      setReviewHydrationState('no_prior_attempt');
    };
  }, [input.mode, input.from, normalizedSessionId, submitResult]);

  const onAnswerAsNew = useMemo(() => {
    return () => {
      setPendingRetryProvenance(null);
      setSelectedChoiceId(null);
      setSubmitResult(null);
      setSessionUnansweredReveal(null);
      setSubmitIdempotencyKey(crypto.randomUUID());
      setQuestionLoadedAt(Date.now());
      setReviewHydrationState('no_prior_attempt');
    };
  }, []);

  useEffect(() => {
    if (!submitResult || !pendingRetryProvenance) return;

    if (
      pendingRetryProvenance.retryOrigin === 'session_review' &&
      normalizedSessionId
    ) {
      setSessionNavigation((current) => {
        if (!current) return current;
        if (
          current.currentIndex < 0 ||
          current.currentIndex >= current.questions.length
        ) {
          return current;
        }

        const questions = current.questions.map((q, index) =>
          index === current.currentIndex ? { ...q, wasRetried: true } : q,
        );
        sessionQuestionsBySessionIdRef.current.set(
          normalizedSessionId,
          questions,
        );
        return { ...current, questions };
      });
    }

    setPendingRetryProvenance(null);
  }, [submitResult, pendingRetryProvenance, normalizedSessionId]);

  return {
    loadState,
    question,
    selectedChoiceId,
    submitResult,
    isLoadingPreviousAttempt,
    reviewHydrationState,
    sessionUnansweredReveal,
    canSubmit,
    isPending,
    bookmarkStatus,
    isBookmarkHydrated,
    isBookmarked,
    onTryAgain: loadQuestion,
    onToggleBookmark,
    onSelectChoice,
    onSubmit,
    onReattempt,
    onAnswerAsNew,
    sessionNavigation,
  };
}
