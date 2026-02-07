'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  createLoadQuestionAction,
  type LoadState,
  reattemptQuestion,
  submitSelectedAnswer,
} from '@/app/(app)/app/questions/[slug]/question-page-logic';
import { ErrorCard } from '@/components/error-card';
import { Feedback } from '@/components/question/Feedback';
import { QuestionCard } from '@/components/question/QuestionCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/lib/routes';
import { useIsMounted } from '@/lib/use-is-mounted';
import { submitAnswer } from '@/src/adapters/controllers/question-controller';
import {
  type GetQuestionBySlugOutput,
  getQuestionBySlug,
} from '@/src/adapters/controllers/question-view-controller';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type QuestionViewProps = {
  loadState: LoadState;
  question: GetQuestionBySlugOutput | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  canSubmit: boolean;
  isPending: boolean;
  onTryAgain: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onReattempt: () => void;
};

export function QuestionView(props: QuestionViewProps) {
  const correctChoiceId = props.submitResult?.correctChoiceId ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            Question
          </h1>
          <p className="mt-1 text-muted-foreground">
            Reattempt a question from your review list.
          </p>
        </div>
        <Link
          href={ROUTES.APP_DASHBOARD}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to Dashboard
        </Link>
      </div>

      {props.loadState.status === 'error' ? (
        <ErrorCard className="p-6">
          <div>{props.loadState.message}</div>
          <Button
            type="button"
            variant="outline"
            className="mt-4 rounded-full"
            onClick={props.onTryAgain}
          >
            Try again
          </Button>
        </ErrorCard>
      ) : null}

      {props.loadState.status === 'loading' ? (
        <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
          <output aria-live="polite">Loading question…</output>
        </Card>
      ) : null}

      {props.loadState.status === 'ready' && props.question === null ? (
        <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
          Question not found.
        </Card>
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
          choiceExplanations={props.submitResult.choiceExplanations}
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {!props.submitResult ? (
          <Button
            type="button"
            className="rounded-full"
            disabled={
              !props.canSubmit ||
              props.isPending ||
              props.loadState.status === 'loading'
            }
            onClick={props.onSubmit}
          >
            Submit
          </Button>
        ) : null}

        {props.submitResult ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={props.isPending}
              onClick={props.onReattempt}
            >
              Try Again
            </Button>
            <Button asChild variant="ghost" className="rounded-full">
              <Link href={ROUTES.APP_REVIEW}>Back to Review</Link>
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function QuestionPageClient({ slug }: { slug: string }) {
  const [question, setQuestion] = useState<GetQuestionBySlugOutput | null>(
    null,
  );
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitAnswerOutput | null>(
    null,
  );
  const [questionLoadedAt, setQuestionLoadedAt] = useState<number | null>(null);
  const [submitIdempotencyKey, setSubmitIdempotencyKey] = useState<
    string | null
  >(null);
  const [loadState, setLoadState] = useState<LoadState>({
    status: 'loading',
  });
  const [isPending, startTransition] = useTransition();
  const isMounted = useIsMounted();

  const loadQuestion = useMemo(
    () =>
      createLoadQuestionAction({
        slug,
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
        isMounted,
      }),
    [slug, isMounted],
  );

  useEffect(loadQuestion, [loadQuestion]);

  const canSubmit = useMemo(() => {
    return (
      question !== null && selectedChoiceId !== null && submitResult === null
    );
  }, [question, selectedChoiceId, submitResult]);

  const onSubmit = useMemo(
    () =>
      submitSelectedAnswer.bind(null, {
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

  const onReattempt = useMemo(
    () =>
      reattemptQuestion.bind(null, {
        createIdempotencyKey: () => crypto.randomUUID(),
        nowMs: Date.now,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
      }),
    [],
  );

  return (
    <QuestionView
      loadState={loadState}
      question={question}
      selectedChoiceId={selectedChoiceId}
      submitResult={submitResult}
      canSubmit={canSubmit}
      isPending={isPending}
      onTryAgain={loadQuestion}
      onSelectChoice={setSelectedChoiceId}
      onSubmit={onSubmit}
      onReattempt={onReattempt}
    />
  );
}
