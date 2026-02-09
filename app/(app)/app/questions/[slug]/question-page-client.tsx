'use client';

import Link from 'next/link';
import { ErrorCard } from '@/components/error-card';
import { Feedback } from '@/components/question/feedback';
import { QuestionCard } from '@/components/question/question-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/lib/routes';
import {
  type UseQuestionPageControllerOutput,
  useQuestionPageController,
} from './use-question-page-controller';

export type QuestionViewProps = UseQuestionPageControllerOutput;

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
          className="rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
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
  const controller = useQuestionPageController({ slug });
  return <QuestionView {...controller} />;
}
