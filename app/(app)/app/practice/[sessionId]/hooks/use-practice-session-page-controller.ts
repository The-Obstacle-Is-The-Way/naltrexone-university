import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  createLoadNextQuestionAction,
  loadNextQuestion,
  maybeAutoAdvanceAfterSubmit,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import {
  canSubmitAnswer,
  createBookmarksEffect,
  type LoadState,
  selectChoiceIfAllowed,
  toggleBookmarkForQuestion,
} from '@/app/(app)/app/practice/practice-page-logic';
import { useIsMounted } from '@/lib/use-is-mounted';
import {
  getBookmarks,
  toggleBookmark,
} from '@/src/adapters/controllers/bookmark-controller';
import {
  getNextQuestion,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import type { PracticeSessionPageViewProps } from '../components/practice-session-page-view';
import { isQuestionBookmarked } from '../practice-session-page-utils';
import { usePracticeSessionMarkForReview } from './use-practice-session-mark-for-review';
import { usePracticeSessionReviewStage } from './use-practice-session-review-stage';

export function usePracticeSessionPageController(
  sessionId: string,
): PracticeSessionPageViewProps {
  const [question, setQuestion] = useState<NextQuestion | null>(null);
  const [sessionInfo, setSessionInfo] = useState<NextQuestion['session']>(null);
  const [sessionMode, setSessionMode] = useState<'tutor' | 'exam' | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitAnswerOutput | null>(
    null,
  );

  const [bookmarkedQuestionIds, setBookmarkedQuestionIds] = useState<
    Set<string>
  >(() => new Set());
  const [bookmarkStatus, setBookmarkStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');
  const [bookmarkMessage, setBookmarkMessage] = useState<string | null>(null);
  const bookmarkMessageTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [bookmarkRetryCount, setBookmarkRetryCount] = useState(0);

  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const isMounted = useIsMounted();
  const [questionLoadedAt, setQuestionLoadedAt] = useState<number | null>(null);
  const [submitIdempotencyKey, setSubmitIdempotencyKey] = useState<
    string | null
  >(null);

  const loadNext = useMemo(
    () =>
      createLoadNextQuestionAction({
        sessionId,
        startTransition,
        getNextQuestionFn: getNextQuestion,
        createIdempotencyKey: () => crypto.randomUUID(),
        nowMs: Date.now,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
        setSessionInfo,
        isMounted,
      }),
    [sessionId, isMounted],
  );

  useEffect(loadNext, [loadNext]);

  useEffect(() => {
    if (!sessionInfo?.mode) return;
    setSessionMode(sessionInfo.mode);
  }, [sessionInfo?.mode]);

  const loadSpecificQuestion = useCallback(
    (questionId: string): void => {
      startTransition(() => {
        void loadNextQuestion({
          sessionId,
          questionId,
          getNextQuestionFn: getNextQuestion,
          createIdempotencyKey: () => crypto.randomUUID(),
          nowMs: Date.now,
          setLoadState,
          setSelectedChoiceId,
          setSubmitResult,
          setSubmitIdempotencyKey,
          setQuestionLoadedAt,
          setQuestion,
          setSessionInfo,
          isMounted,
        });
      });
    },
    [sessionId, isMounted],
  );

  const reviewStage = usePracticeSessionReviewStage({
    sessionId,
    isMounted,
    sessionInfo,
    questionId: question?.questionId ?? null,
    submitResult,
    sessionMode,
    setSessionMode,
    setLoadState,
    setQuestion,
    setSubmitResult,
    setSelectedChoiceId,
    loadSpecificQuestion,
  });

  useEffect(() => {
    if (reviewStage.isInReviewStage) return;

    maybeAutoAdvanceAfterSubmit({
      mode: sessionMode,
      submitResult,
      loadStateStatus: loadState.status,
      advance: loadNext,
    });
  }, [
    reviewStage.isInReviewStage,
    sessionMode,
    submitResult,
    loadState.status,
    loadNext,
  ]);

  const bookmarksEffect = useMemo(
    () =>
      createBookmarksEffect.bind(null, {
        bookmarkRetryCount,
        getBookmarksFn: getBookmarks,
        setBookmarkedQuestionIds,
        setBookmarkStatus,
        setBookmarkRetryCount,
      }),
    [bookmarkRetryCount],
  );

  useEffect(bookmarksEffect, [bookmarksEffect]);

  useEffect(() => {
    return () => {
      if (bookmarkMessageTimeoutId.current) {
        clearTimeout(bookmarkMessageTimeoutId.current);
      }
    };
  }, []);

  const canSubmit = useMemo(() => {
    return canSubmitAnswer({
      loadState,
      question,
      selectedChoiceId,
      submitResult,
    });
  }, [loadState, question, selectedChoiceId, submitResult]);

  const isBookmarked = useMemo(
    () => isQuestionBookmarked(question, bookmarkedQuestionIds),
    [bookmarkedQuestionIds, question],
  );

  const onSubmit = useMemo(
    () =>
      submitAnswerForQuestion.bind(null, {
        sessionId,
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
      sessionId,
      submitIdempotencyKey,
      isMounted,
    ],
  );

  const onToggleBookmark = useMemo(
    () =>
      toggleBookmarkForQuestion.bind(null, {
        question,
        toggleBookmarkFn: toggleBookmark,
        setBookmarkStatus,
        setBookmarkedQuestionIds,
        onBookmarkToggled: (bookmarked: boolean) => {
          setBookmarkMessage(
            bookmarked ? 'Question bookmarked.' : 'Bookmark removed.',
          );
          if (bookmarkMessageTimeoutId.current) {
            clearTimeout(bookmarkMessageTimeoutId.current);
          }
          bookmarkMessageTimeoutId.current = setTimeout(() => {
            setBookmarkMessage(null);
          }, 2000);
        },
        isMounted,
      }),
    [question, isMounted],
  );

  const { isMarkingForReview, onToggleMarkForReview } =
    usePracticeSessionMarkForReview({
      question,
      sessionMode,
      sessionInfo,
      sessionId,
      setSessionInfo,
      setLoadState,
      setReview: reviewStage.setReview,
      isMounted,
    });

  const onSelectChoice = useMemo(
    () => selectChoiceIfAllowed.bind(null, submitResult, setSelectedChoiceId),
    [submitResult],
  );

  return {
    summary: reviewStage.summary,
    summaryReview: reviewStage.summaryReview,
    summaryReviewLoadState: reviewStage.summaryReviewLoadState,
    review: reviewStage.review,
    reviewLoadState: reviewStage.reviewLoadState,
    navigator: reviewStage.navigator,
    sessionInfo,
    loadState,
    question,
    selectedChoiceId,
    submitResult,
    isPending,
    bookmarkStatus,
    isBookmarked,
    isMarkingForReview,
    bookmarkMessage,
    canSubmit,
    onEndSession: reviewStage.onEndSession,
    onTryAgain: loadNext,
    onToggleBookmark,
    onToggleMarkForReview,
    onSelectChoice,
    onSubmit,
    onNextQuestion: loadNext,
    onNavigateQuestion: loadSpecificQuestion,
    onOpenReviewQuestion: reviewStage.onOpenReviewQuestion,
    onFinalizeReview: reviewStage.onFinalizeReview,
  };
}
