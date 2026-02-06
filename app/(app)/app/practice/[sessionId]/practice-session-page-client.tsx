'use client';

import Link from 'next/link';
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
  endSession,
  loadNextQuestion,
  maybeAutoAdvanceAfterSubmit,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import { PracticeView } from '@/app/(app)/app/practice/page';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import {
  canSubmitAnswer,
  createBookmarksEffect,
  type LoadState,
  selectChoiceIfAllowed,
  toggleBookmarkForQuestion,
} from '@/app/(app)/app/practice/practice-page-logic';
import { Button } from '@/components/ui/button';
import { useIsMounted } from '@/lib/use-is-mounted';
import {
  getBookmarks,
  toggleBookmark,
} from '@/src/adapters/controllers/bookmark-controller';
import {
  type EndPracticeSessionOutput,
  endPracticeSession,
  type GetPracticeSessionReviewOutput,
  getPracticeSessionReview,
  setPracticeSessionQuestionMark,
} from '@/src/adapters/controllers/practice-controller';
import {
  getNextQuestion,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export function isQuestionBookmarked(
  question: NextQuestion | null,
  bookmarkedQuestionIds: Set<string>,
): boolean {
  if (!question) return false;
  return bookmarkedQuestionIds.has(question.questionId);
}

export function SessionSummaryView({
  summary,
}: {
  summary: EndPracticeSessionOutput;
}) {
  const accuracyPercent = Math.round(summary.totals.accuracy * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          Session Summary
        </h1>
        <p className="mt-1 text-muted-foreground">Here&apos;s how you did.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-border/50 hover:bg-muted">
          <div className="text-sm text-muted-foreground">Answered</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {summary.totals.answered}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-border/50 hover:bg-muted">
          <div className="text-sm text-muted-foreground">Correct</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {summary.totals.correct}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-border/50 hover:bg-muted">
          <div className="text-sm text-muted-foreground">Accuracy</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {accuracyPercent}%
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-border/50 hover:bg-muted">
          <div className="text-sm text-muted-foreground">Duration</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {summary.totals.durationSeconds}s
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild className="rounded-full">
          <Link href="/app/dashboard">Back to Dashboard</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/app/practice">Start another session</Link>
        </Button>
      </div>
    </div>
  );
}

export function ExamReviewView({
  review,
  isPending,
  onOpenQuestion,
  onFinalizeReview,
}: {
  review: GetPracticeSessionReviewOutput;
  isPending: boolean;
  onOpenQuestion: (questionId: string) => void;
  onFinalizeReview: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          Review Questions
        </h1>
        <p className="mt-1 text-muted-foreground">
          Check answered, unanswered, and marked questions before final submit.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Answered</div>
          <div className="mt-1 text-2xl font-bold font-display text-foreground">
            {review.answeredCount}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Unanswered</div>
          <div className="mt-1 text-2xl font-bold font-display text-foreground">
            {review.totalCount - review.answeredCount}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Marked</div>
          <div className="mt-1 text-2xl font-bold font-display text-foreground">
            {review.markedCount}
          </div>
        </div>
      </div>

      <ul className="space-y-3">
        {review.rows.map((row) => (
          <li
            key={row.questionId}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">
                  {row.isAvailable
                    ? `${row.order}. ${getStemPreview(row.stemMd, 96)}`
                    : `${row.order}. [Question no longer available]`}
                </div>
                <div className="text-xs text-muted-foreground">
                  {row.isAnswered ? 'Answered' : 'Unanswered'}
                  <span className="mx-2">•</span>
                  <span>
                    {row.markedForReview ? 'Marked for review' : 'Not marked'}
                  </span>
                  {row.isAnswered && row.isCorrect !== null ? (
                    <>
                      <span className="mx-2">•</span>
                      <span>{row.isCorrect ? 'Correct' : 'Incorrect'}</span>
                    </>
                  ) : null}
                </div>
              </div>

              {row.isAvailable ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => onOpenQuestion(row.questionId)}
                >
                  Open question
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          className="rounded-full"
          disabled={isPending}
          onClick={onFinalizeReview}
        >
          Submit exam
        </Button>
      </div>
    </div>
  );
}

export type PracticeSessionPageViewProps = {
  summary: EndPracticeSessionOutput | null;
  review?: GetPracticeSessionReviewOutput | null;
  reviewLoadState?: LoadState;
  sessionInfo: NextQuestion['session'];
  loadState: LoadState;
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  isPending: boolean;
  bookmarkStatus: 'idle' | 'loading' | 'error';
  isBookmarked: boolean;
  isMarkingForReview?: boolean;
  bookmarkMessage?: string | null;
  canSubmit: boolean;
  onEndSession: () => void;
  onTryAgain: () => void;
  onToggleBookmark: () => void;
  onToggleMarkForReview?: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onNextQuestion: () => void;
  onOpenReviewQuestion?: (questionId: string) => void;
  onFinalizeReview?: () => void;
};

export function PracticeSessionPageView(props: PracticeSessionPageViewProps) {
  const review = props.review ?? null;
  const reviewLoadState = props.reviewLoadState ?? { status: 'idle' };

  if (props.summary) {
    return <SessionSummaryView summary={props.summary} />;
  }

  if (reviewLoadState.status === 'loading' && !review) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
        Loading review...
      </div>
    );
  }

  if (reviewLoadState.status === 'error' && !review) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive shadow-sm">
          {reviewLoadState.message}
        </div>
        <Button type="button" variant="outline" onClick={props.onEndSession}>
          Try again
        </Button>
      </div>
    );
  }

  if (review) {
    return (
      <ExamReviewView
        review={review}
        isPending={props.isPending}
        onOpenQuestion={props.onOpenReviewQuestion ?? (() => undefined)}
        onFinalizeReview={props.onFinalizeReview ?? props.onEndSession}
      />
    );
  }

  return (
    <PracticeView
      sessionInfo={props.sessionInfo}
      loadState={props.loadState}
      question={props.question}
      selectedChoiceId={props.selectedChoiceId}
      submitResult={props.submitResult}
      isPending={props.isPending}
      bookmarkStatus={props.bookmarkStatus}
      isBookmarked={props.isBookmarked}
      isMarkingForReview={props.isMarkingForReview}
      bookmarkMessage={props.bookmarkMessage}
      canSubmit={props.canSubmit}
      endSessionLabel={
        props.sessionInfo?.mode === 'exam' ? 'Review answers' : 'End session'
      }
      onEndSession={props.onEndSession}
      onTryAgain={props.onTryAgain}
      onToggleBookmark={props.onToggleBookmark}
      onToggleMarkForReview={props.onToggleMarkForReview}
      onSelectChoice={props.onSelectChoice}
      onSubmit={props.onSubmit}
      onNextQuestion={props.onNextQuestion}
    />
  );
}

export default function PracticeSessionPageClient({
  sessionId,
}: {
  sessionId: string;
}) {
  const [question, setQuestion] = useState<NextQuestion | null>(null);
  const [sessionInfo, setSessionInfo] = useState<NextQuestion['session']>(null);
  const [sessionMode, setSessionMode] = useState<'tutor' | 'exam' | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitAnswerOutput | null>(
    null,
  );
  const [summary, setSummary] = useState<EndPracticeSessionOutput | null>(null);
  const [review, setReview] = useState<GetPracticeSessionReviewOutput | null>(
    null,
  );
  const [reviewLoadState, setReviewLoadState] = useState<LoadState>({
    status: 'idle',
  });
  const [isInReviewStage, setIsInReviewStage] = useState(false);
  const [isMarkingForReview, setIsMarkingForReview] = useState(false);

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

  useEffect(() => {
    if (isInReviewStage) return;

    maybeAutoAdvanceAfterSubmit({
      mode: sessionMode,
      submitResult,
      loadStateStatus: loadState.status,
      advance: loadNext,
    });
  }, [isInReviewStage, sessionMode, submitResult, loadState.status, loadNext]);

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

  const finalizeSession = useMemo(
    () =>
      endSession.bind(null, {
        sessionId,
        endPracticeSessionFn: endPracticeSession,
        setLoadState,
        setSummary,
        setQuestion,
        setSubmitResult,
        setSelectedChoiceId,
        isMounted,
      }),
    [sessionId, isMounted],
  );

  const loadReview = useCallback(async (): Promise<void> => {
    setReviewLoadState({ status: 'loading' });

    let res: Awaited<ReturnType<typeof getPracticeSessionReview>>;
    try {
      res = await getPracticeSessionReview({ sessionId });
    } catch (error) {
      if (!isMounted()) return;
      setReviewLoadState({
        status: 'error',
        message: getThrownErrorMessage(error),
      });
      return;
    }
    if (!isMounted()) return;

    if (!res.ok) {
      setReviewLoadState({
        status: 'error',
        message: getActionResultErrorMessage(res),
      });
      return;
    }

    if (res.data.mode !== 'exam') {
      setReview(null);
      setReviewLoadState({ status: 'idle' });
      setIsInReviewStage(false);
      setSessionMode(res.data.mode);
      void finalizeSession();
      return;
    }

    setReview(res.data);
    setReviewLoadState({ status: 'ready' });
    setIsInReviewStage(true);
    setSessionMode(res.data.mode);
    setQuestion(null);
    setSubmitResult(null);
    setSelectedChoiceId(null);
  }, [sessionId, isMounted, finalizeSession]);

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

  const onOpenReviewQuestion = useCallback(
    (questionId: string): void => {
      setReview(null);
      setReviewLoadState({ status: 'idle' });
      setIsInReviewStage(true);
      loadSpecificQuestion(questionId);
    },
    [loadSpecificQuestion],
  );

  const onFinalizeReview = useCallback(() => {
    setReview(null);
    setReviewLoadState({ status: 'idle' });
    setIsInReviewStage(false);
    void finalizeSession();
  }, [finalizeSession]);

  const onToggleMarkForReview = useCallback(async () => {
    if (!question) return;
    if (sessionMode !== 'exam') return;
    if (isMarkingForReview) return;

    const markedForReview = !sessionInfo?.isMarkedForReview;
    setIsMarkingForReview(true);

    let res: Awaited<ReturnType<typeof setPracticeSessionQuestionMark>>;
    try {
      res = await setPracticeSessionQuestionMark({
        sessionId,
        questionId: question.questionId,
        markedForReview,
      });
    } catch (error) {
      if (!isMounted()) return;
      setLoadState({ status: 'error', message: getThrownErrorMessage(error) });
      setIsMarkingForReview(false);
      return;
    }
    if (!isMounted()) return;

    if (!res.ok) {
      setLoadState({
        status: 'error',
        message: getActionResultErrorMessage(res),
      });
      setIsMarkingForReview(false);
      return;
    }

    setSessionInfo((prev) =>
      prev ? { ...prev, isMarkedForReview: res.data.markedForReview } : prev,
    );

    setReview((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((row) => {
        if (row.questionId !== res.data.questionId) return row;
        return { ...row, markedForReview: res.data.markedForReview };
      });
      return {
        ...prev,
        rows,
        markedCount: rows.filter((row) => row.markedForReview).length,
      };
    });

    setIsMarkingForReview(false);
  }, [
    question,
    sessionMode,
    isMarkingForReview,
    sessionInfo?.isMarkedForReview,
    sessionId,
    isMounted,
  ]);

  const onEndSession = useCallback(() => {
    if (sessionMode === 'exam' || isInReviewStage || sessionMode === null) {
      void loadReview();
      return;
    }
    void finalizeSession();
  }, [sessionMode, isInReviewStage, loadReview, finalizeSession]);

  const onSelectChoice = useMemo(
    () => selectChoiceIfAllowed.bind(null, submitResult, setSelectedChoiceId),
    [submitResult],
  );

  return (
    <PracticeSessionPageView
      summary={summary}
      review={review}
      reviewLoadState={reviewLoadState}
      sessionInfo={sessionInfo}
      loadState={loadState}
      question={question}
      selectedChoiceId={selectedChoiceId}
      submitResult={submitResult}
      isPending={isPending}
      bookmarkStatus={bookmarkStatus}
      isBookmarked={isBookmarked}
      isMarkingForReview={isMarkingForReview}
      bookmarkMessage={bookmarkMessage}
      canSubmit={canSubmit}
      onEndSession={onEndSession}
      onTryAgain={loadNext}
      onToggleBookmark={onToggleBookmark}
      onToggleMarkForReview={onToggleMarkForReview}
      onSelectChoice={onSelectChoice}
      onSubmit={onSubmit}
      onNextQuestion={loadNext}
      onOpenReviewQuestion={onOpenReviewQuestion}
      onFinalizeReview={onFinalizeReview}
    />
  );
}
