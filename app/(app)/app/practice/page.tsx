'use client';

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Practice</h1>
        <p className="mt-1 text-muted-foreground">
          Answer one question at a time.
        </p>
      </div>

      {loadState.status === 'error' ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive shadow-sm">
          {loadState.message}
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
