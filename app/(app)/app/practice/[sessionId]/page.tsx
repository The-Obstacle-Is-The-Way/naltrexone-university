'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
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
import { PracticeView } from '../page';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

function getErrorMessage(result: ActionResult<unknown>): string {
  if (result.ok) return 'Unexpected ok result';
  return result.error.message;
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
          className="inline-flex items-center justify-center rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
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

export default function PracticeSessionPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const sessionId = params.sessionId;

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
  const [bookmarkRetryCount, setBookmarkRetryCount] = useState(0);

  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const [questionLoadedAt, setQuestionLoadedAt] = useState<number | null>(null);

  const loadNext = useCallback(() => {
    startTransition(() => {
      void (async () => {
        setLoadState({ status: 'loading' });
        setSelectedChoiceId(null);
        setSubmitResult(null);
        setQuestionLoadedAt(null);

        const res = await getNextQuestion({ sessionId });

        if (!res.ok) {
          setLoadState({ status: 'error', message: getErrorMessage(res) });
          setQuestion(null);
          return;
        }

        setQuestion(res.data);
        setQuestionLoadedAt(res.data ? Date.now() : null);
        if (res.data?.session) {
          setSessionInfo(res.data.session);
        }
        setLoadState({ status: 'ready' });
      })();
    });
  }, [sessionId]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      const res = await getBookmarks({});
      if (!mounted) return;

      if (!res.ok) {
        console.error('Failed to load bookmarks', res.error);
        setBookmarkStatus('error');

        if (bookmarkRetryCount < 2) {
          timeoutId = setTimeout(
            () => {
              if (mounted) {
                setBookmarkRetryCount((prev) => prev + 1);
              }
            },
            1000 * (bookmarkRetryCount + 1),
          );
        }

        return;
      }

      setBookmarkedQuestionIds(
        new Set(res.data.rows.map((row) => row.questionId)),
      );
      setBookmarkStatus('idle');
    })();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [bookmarkRetryCount]);

  const canSubmit = useMemo(() => {
    return (
      question !== null && selectedChoiceId !== null && submitResult === null
    );
  }, [question, selectedChoiceId, submitResult]);

  const isBookmarked = question
    ? bookmarkedQuestionIds.has(question.questionId)
    : false;

  async function onSubmit() {
    if (!question) return;
    if (!selectedChoiceId) return;

    setLoadState({ status: 'loading' });

    const timeSpentSeconds = questionLoadedAt
      ? Math.floor((Date.now() - questionLoadedAt) / 1000)
      : 0;

    const res = await submitAnswer({
      questionId: question.questionId,
      choiceId: selectedChoiceId,
      sessionId,
      timeSpentSeconds,
    });

    if (!res.ok) {
      setLoadState({ status: 'error', message: getErrorMessage(res) });
      return;
    }

    setSubmitResult(res.data);
    setLoadState({ status: 'ready' });
  }

  async function onToggleBookmark() {
    if (!question) return;

    const questionId = question.questionId;

    setBookmarkStatus('loading');

    const res = await toggleBookmark({ questionId });
    if (!res.ok) {
      setBookmarkStatus('error');
      setLoadState({ status: 'error', message: getErrorMessage(res) });
      return;
    }

    setBookmarkedQuestionIds((prev) => {
      const next = new Set(prev);
      if (res.data.bookmarked) next.add(questionId);
      else next.delete(questionId);
      return next;
    });

    setBookmarkStatus('idle');
  }

  async function onEndSession() {
    setLoadState({ status: 'loading' });

    const res = await endPracticeSession({ sessionId });
    if (!res.ok) {
      setLoadState({ status: 'error', message: getErrorMessage(res) });
      return;
    }

    setSummary(res.data);
    setQuestion(null);
    setSubmitResult(null);
    setSelectedChoiceId(null);
    setLoadState({ status: 'ready' });
  }

  if (summary) {
    return <SessionSummaryView summary={summary} />;
  }

  return (
    <PracticeView
      sessionInfo={sessionInfo}
      loadState={loadState}
      question={question}
      selectedChoiceId={selectedChoiceId}
      submitResult={submitResult}
      isPending={isPending}
      bookmarkStatus={bookmarkStatus}
      isBookmarked={isBookmarked}
      canSubmit={canSubmit}
      onEndSession={() => void onEndSession()}
      onTryAgain={loadNext}
      onToggleBookmark={() => void onToggleBookmark()}
      onSelectChoice={(choiceId) => {
        if (submitResult) return;
        setSelectedChoiceId(choiceId);
      }}
      onSubmit={() => void onSubmit()}
      onNextQuestion={loadNext}
    />
  );
}
