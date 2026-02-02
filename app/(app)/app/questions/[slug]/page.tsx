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
import { submitAnswer } from '@/src/adapters/controllers/question-controller';
import {
  type GetQuestionBySlugOutput,
  getQuestionBySlug,
} from '@/src/adapters/controllers/question-view-controller';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

function getErrorMessage(result: ActionResult<unknown>): string {
  if (result.ok) return 'Unexpected ok result';
  return result.error.message;
}

export default function QuestionPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;

  const [question, setQuestion] = useState<GetQuestionBySlugOutput | null>(
    null,
  );
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitAnswerOutput | null>(
    null,
  );
  const [questionLoadedAt, setQuestionLoadedAt] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({
    status: 'loading',
  });
  const [isPending, startTransition] = useTransition();

  const loadQuestion = useCallback(() => {
    startTransition(() => {
      void (async () => {
        setLoadState({ status: 'loading' });
        setSelectedChoiceId(null);
        setSubmitResult(null);
        setQuestionLoadedAt(null);

        const res = await getQuestionBySlug({ slug });
        if (!res.ok) {
          setLoadState({ status: 'error', message: getErrorMessage(res) });
          setQuestion(null);
          return;
        }

        setQuestion(res.data);
        setQuestionLoadedAt(Date.now());
        setLoadState({ status: 'ready' });
      })();
    });
  }, [slug]);

  useEffect(() => {
    loadQuestion();
  }, [loadQuestion]);

  const canSubmit = useMemo(() => {
    return (
      question !== null && selectedChoiceId !== null && submitResult === null
    );
  }, [question, selectedChoiceId, submitResult]);

  const correctChoiceId = submitResult?.correctChoiceId ?? null;

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

  function onReattempt() {
    setSelectedChoiceId(null);
    setSubmitResult(null);
    setQuestionLoadedAt(Date.now());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Question</h1>
          <p className="mt-1 text-muted-foreground">
            Reattempt a question from your review list.
          </p>
        </div>
        <Link
          href="/app/dashboard"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Back to Dashboard
        </Link>
      </div>

      {loadState.status === 'error' ? (
        <div
          className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive shadow-sm"
          role="alert"
        >
          <div>{loadState.message}</div>
          <button
            type="button"
            className="mt-4 inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            onClick={loadQuestion}
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

      {loadState.status === 'ready' && question === null ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          Question not found.
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
          onSelectChoice={setSelectedChoiceId}
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
          onClick={onSubmit}
        >
          Submit
        </button>

        {submitResult ? (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            onClick={onReattempt}
          >
            Reattempt
          </button>
        ) : null}
      </div>
    </div>
  );
}
