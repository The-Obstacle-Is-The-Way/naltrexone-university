'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';
import { Feedback } from '@/components/question/Feedback';
import { QuestionCard } from '@/components/question/QuestionCard';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  getBookmarks,
  toggleBookmark,
} from '@/src/adapters/controllers/bookmark-controller';
import { startPracticeSession } from '@/src/adapters/controllers/practice-controller';
import {
  getNextQuestion,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

function getErrorMessage(result: ActionResult<unknown>): string {
  if (result.ok) return 'Unexpected ok result';
  return result.error.message;
}

export type PracticeViewProps = {
  topContent?: React.ReactNode;
  sessionInfo?: NextQuestion['session'];
  loadState: LoadState;
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  isPending: boolean;
  bookmarkStatus: 'idle' | 'loading' | 'error';
  isBookmarked: boolean;
  canSubmit: boolean;
  onEndSession?: () => void;
  onTryAgain: () => void;
  onToggleBookmark: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onNextQuestion: () => void;
};

export function PracticeView(props: PracticeViewProps) {
  const correctChoiceId = props.submitResult?.correctChoiceId ?? null;
  const sessionInfo = props.sessionInfo ?? null;

  return (
    <div className="space-y-6">
      {props.topContent}
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Practice</h1>
            <p className="mt-1 text-muted-foreground">
              Answer one question at a time.
            </p>
            {sessionInfo ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Session: {sessionInfo.mode} • {sessionInfo.index + 1}/
                {sessionInfo.total}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {props.onEndSession ? (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                disabled={props.isPending}
                onClick={props.onEndSession}
              >
                End session
              </button>
            ) : null}
            <Link
              href="/app/dashboard"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>

      {props.loadState.status === 'error' ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive shadow-sm">
          <div>{props.loadState.message}</div>
          <button
            type="button"
            className="mt-4 inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            onClick={props.onTryAgain}
          >
            Try again
          </button>
        </div>
      ) : null}

      {props.loadState.status === 'loading' ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          Loading question…
        </div>
      ) : null}

      {props.loadState.status === 'ready' && props.question === null ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          No more questions found.
        </div>
      ) : null}

      {props.question ? (
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={props.bookmarkStatus === 'loading' || props.isPending}
            onClick={props.onToggleBookmark}
          >
            {props.isBookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>
          {props.bookmarkStatus === 'error' ? (
            <div className="text-xs text-destructive">
              Bookmarks unavailable.
            </div>
          ) : null}
        </div>
      ) : null}

      {props.question ? (
        <QuestionCard
          stemMd={props.question.stemMd}
          choices={props.question.choices.map((c) => ({
            id: c.id,
            label: c.label,
            textMd: c.textMd,
          }))}
          selectedChoiceId={props.selectedChoiceId}
          correctChoiceId={correctChoiceId}
          disabled={props.isPending || props.loadState.status === 'loading'}
          onSelectChoice={props.onSelectChoice}
        />
      ) : null}

      {props.submitResult ? (
        <Feedback
          isCorrect={props.submitResult.isCorrect}
          explanationMd={props.submitResult.explanationMd}
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!props.canSubmit || props.isPending}
          onClick={props.onSubmit}
        >
          Submit
        </button>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          disabled={props.isPending || props.loadState.status === 'loading'}
          onClick={props.onNextQuestion}
        >
          Next Question
        </button>
      </div>
    </div>
  );
}

export default function PracticePage() {
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
  const [bookmarkRetryCount, setBookmarkRetryCount] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const [questionLoadedAt, setQuestionLoadedAt] = useState<number | null>(null);
  const [sessionMode, setSessionMode] = useState<'tutor' | 'exam'>('tutor');
  const [sessionCount, setSessionCount] = useState(20);
  const [sessionStartStatus, setSessionStartStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');
  const [sessionStartError, setSessionStartError] = useState<string | null>(
    null,
  );

  const loadNext = useCallback(() => {
    startTransition(() => {
      void (async () => {
        setLoadState({ status: 'loading' });
        setSelectedChoiceId(null);
        setSubmitResult(null);
        setQuestionLoadedAt(null);

        const res = await getNextQuestion({
          filters: { tagSlugs: [], difficulties: [] },
        });

        if (!res.ok) {
          setLoadState({ status: 'error', message: getErrorMessage(res) });
          setQuestion(null);
          return;
        }

        setQuestion(res.data);
        setQuestionLoadedAt(res.data ? Date.now() : null);
        setLoadState({ status: 'ready' });
      })();
    });
  }, []);

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

  async function onStartSession() {
    setSessionStartStatus('loading');
    setSessionStartError(null);

    const res = await startPracticeSession({
      mode: sessionMode,
      count: sessionCount,
      tagSlugs: [],
      difficulties: [],
    });

    if (!res.ok) {
      setSessionStartStatus('error');
      setSessionStartError(getErrorMessage(res));
      return;
    }

    window.location.href = `/app/practice/${res.data.sessionId}`;
  }

  return (
    <PracticeView
      topContent={
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                Start a session
              </div>
              <div className="text-sm text-muted-foreground">
                Tutor mode shows explanations immediately. Exam mode hides
                explanations until you end the session.
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="text-sm text-muted-foreground">
                <span className="mr-2">Mode</span>
                <select
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  value={sessionMode}
                  onChange={(e) =>
                    setSessionMode(e.target.value as 'tutor' | 'exam')
                  }
                >
                  <option value="tutor">Tutor</option>
                  <option value="exam">Exam</option>
                </select>
              </label>

              <label className="text-sm text-muted-foreground">
                <span className="mr-2">Count</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  value={sessionCount}
                  onChange={(e) => setSessionCount(Number(e.target.value))}
                />
              </label>

              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={sessionStartStatus === 'loading' || isPending}
                onClick={() => void onStartSession()}
              >
                Start session
              </button>
            </div>
          </div>

          {sessionStartStatus === 'error' && sessionStartError ? (
            <div className="mt-3 text-sm text-destructive">
              {sessionStartError}
            </div>
          ) : null}
        </div>
      }
      loadState={loadState}
      question={question}
      selectedChoiceId={selectedChoiceId}
      submitResult={submitResult}
      isPending={isPending}
      bookmarkStatus={bookmarkStatus}
      isBookmarked={isBookmarked}
      canSubmit={canSubmit}
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
