'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  createLoadNextQuestionAction,
  endSession,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import { PracticeView } from '@/app/(app)/app/practice/page';
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
import type { EndPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import { endPracticeSession } from '@/src/adapters/controllers/practice-controller';
import {
  getNextQuestion,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
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
        <h1 className="text-2xl font-semibold text-foreground">
          Session Summary
        </h1>
        <p className="mt-1 text-muted-foreground">Here&apos;s how you did.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="text-sm text-muted-foreground">Answered</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {summary.totals.answered}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="text-sm text-muted-foreground">Correct</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {summary.totals.correct}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="text-sm text-muted-foreground">Accuracy</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {accuracyPercent}%
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="text-sm text-muted-foreground">Duration</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {summary.totals.durationSeconds}s
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/app/dashboard"
          className="inline-flex items-center justify-center rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
        >
          Back to Dashboard
        </Link>
        <Link
          href="/app/practice"
          className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Start another session
        </Link>
      </div>
    </div>
  );
}

export type PracticeSessionPageViewProps = {
  summary: EndPracticeSessionOutput | null;
  sessionInfo: NextQuestion['session'];
  loadState: LoadState;
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  isPending: boolean;
  bookmarkStatus: 'idle' | 'loading' | 'error';
  isBookmarked: boolean;
  bookmarkMessage?: string | null;
  canSubmit: boolean;
  onEndSession: () => void;
  onTryAgain: () => void;
  onToggleBookmark: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onNextQuestion: () => void;
};

export function PracticeSessionPageView(props: PracticeSessionPageViewProps) {
  if (props.summary) {
    return <SessionSummaryView summary={props.summary} />;
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
      bookmarkMessage={props.bookmarkMessage}
      canSubmit={props.canSubmit}
      onEndSession={props.onEndSession}
      onTryAgain={props.onTryAgain}
      onToggleBookmark={props.onToggleBookmark}
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
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitAnswerOutput | null>(
    null,
  );
  const [summary, setSummary] = useState<EndPracticeSessionOutput | null>(null);

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

  const onEndSession = useMemo(
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

  const onSelectChoice = useMemo(
    () => selectChoiceIfAllowed.bind(null, submitResult, setSelectedChoiceId),
    [submitResult],
  );

  return (
    <PracticeSessionPageView
      summary={summary}
      sessionInfo={sessionInfo}
      loadState={loadState}
      question={question}
      selectedChoiceId={selectedChoiceId}
      submitResult={submitResult}
      isPending={isPending}
      bookmarkStatus={bookmarkStatus}
      isBookmarked={isBookmarked}
      bookmarkMessage={bookmarkMessage}
      canSubmit={canSubmit}
      onEndSession={onEndSession}
      onTryAgain={loadNext}
      onToggleBookmark={onToggleBookmark}
      onSelectChoice={onSelectChoice}
      onSubmit={onSubmit}
      onNextQuestion={loadNext}
    />
  );
}
