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
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();

  const loadNext = useCallback(() => {
    startTransition(() => {
      void (async () => {
        setLoadState({ status: 'loading' });
        setSelectedChoiceId(null);
        setSubmitResult(null);

        const res = await getNextQuestion({
          filters: { tagSlugs: [], difficulties: [] },
        });

        if (!res.ok) {
          setLoadState({ status: 'error', message: getErrorMessage(res) });
          setQuestion(null);
          return;
        }

        setQuestion(res.data);
        setLoadState({ status: 'ready' });
      })();
    });
  }, []);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  useEffect(() => {
    void (async () => {
      const res = await getBookmarks({});
      if (!res.ok) {
        setBookmarkStatus('error');
        return;
      }
      setBookmarkedQuestionIds(
        new Set(res.data.rows.map((row) => row.questionId)),
      );
      setBookmarkStatus('idle');
    })();
  }, []);

  const canSubmit = useMemo(() => {
    return (
      question !== null && selectedChoiceId !== null && submitResult === null
    );
  }, [question, selectedChoiceId, submitResult]);

  const correctChoiceId = submitResult?.correctChoiceId ?? null;
  const isBookmarked = question
    ? bookmarkedQuestionIds.has(question.questionId)
    : false;

  async function onSubmit() {
    if (!question) return;
    if (!selectedChoiceId) return;

    setLoadState({ status: 'loading' });

    const res = await submitAnswer({
      questionId: question.questionId,
      choiceId: selectedChoiceId,
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

    setBookmarkStatus('loading');

    const res = await toggleBookmark({ questionId: question.questionId });
    if (!res.ok) {
      setBookmarkStatus('error');
      setLoadState({ status: 'error', message: getErrorMessage(res) });
      return;
    }

    setBookmarkedQuestionIds((prev) => {
      const next = new Set(prev);
      if (res.data.bookmarked) next.add(question.questionId);
      else next.delete(question.questionId);
      return next;
    });

    setBookmarkStatus('idle');
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Practice</h1>
            <p className="mt-1 text-muted-foreground">
              Answer one question at a time.
            </p>
          </div>
          <Link
            href="/app/dashboard"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      {loadState.status === 'error' ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive shadow-sm">
          <div>{loadState.message}</div>
          <button
            type="button"
            className="mt-4 inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            onClick={loadNext}
          >
            Try again
          </button>
        </div>
      ) : null}

      {loadState.status === 'loading' ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          Loading question…
        </div>
      ) : null}

      {loadState.status !== 'loading' && question === null ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          No more questions found.
        </div>
      ) : null}

      {question ? (
        <div className="flex items-center justify-end">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={bookmarkStatus === 'loading' || isPending}
            onClick={() => void onToggleBookmark()}
          >
            {isBookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>
        </div>
      ) : null}

      {question ? (
        <QuestionCard
          stemMd={question.stemMd}
          choices={question.choices.map((c) => ({
            id: c.id,
            label: c.label,
            textMd: c.textMd,
          }))}
          selectedChoiceId={selectedChoiceId}
          correctChoiceId={correctChoiceId}
          disabled={isPending || loadState.status === 'loading'}
          onSelectChoice={(choiceId) => {
            if (submitResult) return;
            setSelectedChoiceId(choiceId);
          }}
        />
      ) : null}

      {submitResult ? (
        <Feedback
          isCorrect={submitResult.isCorrect}
          explanationMd={submitResult.explanationMd}
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSubmit || isPending}
          onClick={() => void onSubmit()}
        >
          Submit
        </button>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending || loadState.status === 'loading'}
          onClick={loadNext}
        >
          Next Question
        </button>
      </div>
    </div>
  );
}
