'use client';

// WHY large-file: this presentation model coordinates the question page's retry, feedback, bookmark, hydration, and navigation state as one UI state machine.
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  canSubmitQuestionAnswer,
  createLoadQuestionAction,
  createSubmitSelectedAnswerAction,
  type LoadState,
  normalizeReviewIdentifiers,
  type QuestionPageSubmitResult,
  type RetryProvenance,
  type ReviewHydrationState,
  reattemptQuestion,
  type SessionNavigation,
  type SessionUnansweredReveal,
} from '@/app/(app)/app/questions/[slug]/question-page-logic';
import { selectChoiceIfAllowed } from '@/app/(app)/app/shared/question-guards';
import { reportClientError } from '@/lib/report-client-error';
import type { QuestionMode, QuestionOrigin } from '@/lib/routes';
import { useIsMounted } from '@/lib/use-is-mounted';
import { submitAnswer } from '@/src/adapters/controllers/question-controller';
import {
  type GetQuestionBySlugOutput,
  getQuestionBySlug,
} from '@/src/adapters/controllers/question-view-controller';
import type { AttemptRetryOrigin } from '@/src/domain/entities';
import {
  type QuestionPageBookmarkStatus,
  useQuestionPageBookmarks,
} from './use-question-page-bookmarks';
import {
  type UseQuestionPageFeedbackOutput,
  useQuestionPageFeedback,
} from './use-question-page-feedback';
import { useQuestionPagePreviousAttempt } from './use-question-page-previous-attempt';
import { useQuestionPageSessionNavigation } from './use-question-page-session-navigation';

export type { QuestionPageBookmarkStatus } from './use-question-page-bookmarks';
export type { QuestionPageFeedbackStatus } from './use-question-page-feedback';

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

export type UseQuestionPageModelInput = {
  slug: string;
  mode?: QuestionMode | null;
  from?: QuestionOrigin | null;
  sessionId?: string;
  attemptId?: string;
  historySequence?: readonly string[] | null;
  historyIndex?: number | null;
};

export type UseQuestionPageModelOutput = {
  loadState: LoadState;
  question: GetQuestionBySlugOutput | null;
  selectedChoiceId: string | null;
  submitResult: QuestionPageSubmitResult | null;
  isLoadingPreviousAttempt: boolean;
  reviewHydrationState: ReviewHydrationState | null;
  reviewSessionMode: 'tutor' | 'exam' | null;
  sessionUnansweredReveal: SessionUnansweredReveal | null;
  sessionNavigation: SessionNavigation | null;
  canSubmit: boolean;
  isPending: boolean;
  bookmarkStatus: QuestionPageBookmarkStatus;
  isBookmarkHydrated: boolean;
  isBookmarked: boolean;
  questionFeedback: UseQuestionPageFeedbackOutput;
  onTryAgain: () => void;
  onToggleBookmark: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onReattempt: () => void;
  onAnswerAsNew: () => void;
};

export function useQuestionPageModel(
  input: UseQuestionPageModelInput,
): UseQuestionPageModelOutput {
  const [question, setQuestion] = useState<GetQuestionBySlugOutput | null>(
    null,
  );
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] =
    useState<QuestionPageSubmitResult | null>(null);
  const [sessionUnansweredReveal, setSessionUnansweredReveal] =
    useState<SessionUnansweredReveal | null>(null);
  const [questionLoadedAt, setQuestionLoadedAt] = useState<number | null>(null);
  const [submitIdempotencyKey, setSubmitIdempotencyKey] = useState<
    string | null
  >(null);
  const [loadState, setLoadState] = useState<LoadState>({
    status: 'loading',
  });
  const [isPending, startTransition] = useTransition();
  const isMounted = useIsMounted();
  const latestSlugRef = useRef(input.slug);
  latestSlugRef.current = input.slug;
  const latestLoadQuestionRequestId = useRef(0);
  const latestSubmitRequestId = useRef(0);
  const pendingRetryProvenanceRef = useRef<RetryProvenance | null>(null);
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
      pendingRetryProvenanceRef.current = null;

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

  const { bookmarkStatus, isBookmarkHydrated, isBookmarked, onToggleBookmark } =
    useQuestionPageBookmarks({
      mode: input.mode,
      question,
      isMounted,
    });
  const questionFeedback = useQuestionPageFeedback({
    mode: input.mode,
    question,
    attemptId: submitResult?.attemptId ?? normalizedAttemptId ?? null,
    practiceSessionId: normalizedSessionId ?? null,
    isMounted,
  });
  const { sessionNavigation, markCurrentQuestionRetried } =
    useQuestionPageSessionNavigation({
      slug: input.slug,
      sessionId: normalizedSessionId,
      from: input.from,
      historySequence: input.historySequence,
      historyIndex: input.historyIndex,
      isMounted,
      startTransition,
    });
  const {
    isLoadingPreviousAttempt,
    reviewHydrationState,
    reviewSessionMode,
    resetReviewHydrationState,
  } = useQuestionPagePreviousAttempt({
    mode: input.mode,
    attemptId: normalizedAttemptId,
    sessionId: normalizedSessionId,
    loadState,
    question,
    setSelectedChoiceId,
    setSubmitResult,
    setSessionUnansweredReveal,
    isMounted,
    startTransition,
  });

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

  const onSubmit = useMemo(
    () => () => {
      latestSubmitRequestId.current += 1;
      const requestId = latestSubmitRequestId.current;
      const requestSlug = input.slug;
      const retryProvenance = pendingRetryProvenanceRef.current;

      const runSubmit = createSubmitSelectedAnswerAction({
        startTransition,
        question,
        selectedChoiceId,
        mode: input.mode,
        sessionId: normalizedSessionId,
        questionLoadedAtMs: questionLoadedAt,
        submitIdempotencyKey,
        retryProvenance,
        submitAnswerFn: submitAnswer,
        nowMs: Date.now,
        setLoadState,
        setSubmitResult,
        onSuccess: () => {
          if (
            retryProvenance?.retryOrigin === 'session_review' &&
            normalizedSessionId
          ) {
            markCurrentQuestionRetried();
          }

          pendingRetryProvenanceRef.current = null;
        },
        onUnhandledError: (error) => {
          reportClientError(error, {
            component: 'UseQuestionPageModel',
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
      isMounted,
      markCurrentQuestionRetried,
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
      });
      pendingRetryProvenanceRef.current = retryProvenance;
      resetReviewHydrationState();
    };
  }, [
    input.mode,
    input.from,
    normalizedSessionId,
    submitResult,
    resetReviewHydrationState,
  ]);

  const onAnswerAsNew = useMemo(() => {
    return () => {
      pendingRetryProvenanceRef.current = null;
      setSelectedChoiceId(null);
      setSubmitResult(null);
      setSessionUnansweredReveal(null);
      setSubmitIdempotencyKey(crypto.randomUUID());
      setQuestionLoadedAt(Date.now());
      resetReviewHydrationState();
    };
  }, [resetReviewHydrationState]);

  return {
    loadState,
    question,
    selectedChoiceId,
    submitResult,
    isLoadingPreviousAttempt,
    reviewHydrationState,
    reviewSessionMode,
    sessionUnansweredReveal,
    canSubmit,
    isPending,
    bookmarkStatus,
    isBookmarkHydrated,
    isBookmarked,
    questionFeedback,
    onTryAgain: loadQuestion,
    onToggleBookmark,
    onSelectChoice,
    onSubmit,
    onReattempt,
    onAnswerAsNew,
    sessionNavigation,
  };
}
