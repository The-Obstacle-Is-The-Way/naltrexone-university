import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
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
import {
  canSubmitAnswer,
  createBookmarksEffect,
  createLoadNextQuestionAction,
  type LoadState,
  type PracticeFilters,
  selectChoiceIfAllowed,
  submitAnswerForQuestion,
  toggleBookmarkForQuestion,
} from '../practice-page-logic';
import { scheduleBookmarkMessageAutoClear } from './bookmark-message-timeout';

export type UsePracticeQuestionFlowInput = {
  filters: PracticeFilters;
};

export type UsePracticeQuestionFlowOutput = {
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  loadState: LoadState;
  isPending: boolean;
  bookmarkStatus: 'idle' | 'loading' | 'error';
  bookmarkMessage: string | null;
  bookmarkMessageVersion: number;
  canSubmit: boolean;
  isBookmarked: boolean;
  onTryAgain: () => void;
  onToggleBookmark: () => Promise<void>;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => Promise<void>;
  onNextQuestion: () => void;
};

export function usePracticeQuestionFlow(
  input: UsePracticeQuestionFlowInput,
): UsePracticeQuestionFlowOutput {
  const [question, setQuestion] = useState<NextQuestion | null>(null);
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
  const [bookmarkMessageVersion, setBookmarkMessageVersion] = useState(0);
  const bookmarkMessageTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [bookmarkRetryCount, setBookmarkRetryCount] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const [questionLoadedAt, setQuestionLoadedAt] = useState<number | null>(null);
  const [submitIdempotencyKey, setSubmitIdempotencyKey] = useState<
    string | null
  >(null);
  const [bookmarkIdempotencyKey, setBookmarkIdempotencyKey] = useState<
    string | null
  >(null);
  const latestQuestionRequestId = useRef(0);
  const isMounted = useIsMounted();

  const onTryAgain = useMemo(
    () =>
      createLoadNextQuestionAction({
        startTransition,
        getNextQuestionFn: getNextQuestion,
        filters: input.filters,
        createIdempotencyKey: () => crypto.randomUUID(),
        nowMs: Date.now,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
        createRequestSequenceId: () => {
          latestQuestionRequestId.current += 1;
          return latestQuestionRequestId.current;
        },
        isLatestRequest: (requestId) =>
          requestId === latestQuestionRequestId.current,
        isMounted,
      }),
    [input.filters, isMounted],
  );

  useEffect(onTryAgain, [onTryAgain]);

  useEffect(() => {
    return createBookmarksEffect({
      bookmarkRetryCount,
      getBookmarksFn: getBookmarks,
      setBookmarkedQuestionIds,
      setBookmarkStatus,
      setBookmarkRetryCount,
    });
  }, [bookmarkRetryCount]);

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

  const isBookmarked = question
    ? bookmarkedQuestionIds.has(question.questionId)
    : false;

  const onSubmit = useMemo(
    () =>
      submitAnswerForQuestion.bind(null, {
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

  const onToggleBookmark = useMemo(
    () =>
      toggleBookmarkForQuestion.bind(null, {
        question,
        bookmarkIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
        setBookmarkIdempotencyKey,
        toggleBookmarkFn: toggleBookmark,
        setBookmarkStatus,
        setBookmarkedQuestionIds,
        onBookmarkToggled: (bookmarked: boolean) => {
          setBookmarkMessage(
            bookmarked ? 'Question bookmarked.' : 'Bookmark removed.',
          );
          setBookmarkMessageVersion((prev) => prev + 1);
          scheduleBookmarkMessageAutoClear({
            timeoutIdRef: bookmarkMessageTimeoutId,
            setBookmarkMessage,
            isMounted,
          });
        },
        isMounted,
      }),
    [bookmarkIdempotencyKey, question, isMounted],
  );

  const onSelectChoice = useMemo(
    () => selectChoiceIfAllowed.bind(null, submitResult, setSelectedChoiceId),
    [submitResult],
  );

  return {
    question,
    selectedChoiceId,
    submitResult,
    loadState,
    isPending,
    bookmarkStatus,
    bookmarkMessage,
    bookmarkMessageVersion,
    canSubmit,
    isBookmarked,
    onTryAgain,
    onToggleBookmark,
    onSelectChoice,
    onSubmit,
    onNextQuestion: onTryAgain,
  };
}
