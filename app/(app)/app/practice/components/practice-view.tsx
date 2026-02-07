'use client';

import Link from 'next/link';
import { ErrorCard } from '@/components/error-card';
import { Feedback } from '@/components/question/Feedback';
import { QuestionCard } from '@/components/question/QuestionCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/lib/routes';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import type { LoadState } from '../practice-page-logic';

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
  isMarkingForReview?: boolean;
  bookmarkMessage?: string | null;
  canSubmit: boolean;
  endSessionLabel?: string;
  onEndSession?: () => void;
  onTryAgain: () => void;
  onToggleBookmark: () => void;
  onToggleMarkForReview?: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onNextQuestion: () => void;
};

export function PracticeView(props: PracticeViewProps) {
  const sessionInfo = props.sessionInfo ?? null;
  const isExamMode = sessionInfo?.mode === 'exam';
  const correctChoiceId = isExamMode
    ? null
    : (props.submitResult?.correctChoiceId ?? null);

  return (
    <div className="space-y-6">
      {props.topContent}
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
              Practice
            </h1>
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
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={props.isPending}
                onClick={props.onEndSession}
              >
                {props.endSessionLabel ?? 'End session'}
              </Button>
            ) : null}
            <Link
              href={ROUTES.APP_DASHBOARD}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>

      {props.loadState.status === 'error' ? (
        <ErrorCard className="border-border bg-card p-6">
          <div>{props.loadState.message}</div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={props.onTryAgain}>
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link href={ROUTES.APP_DASHBOARD}>Return to dashboard</Link>
            </Button>
          </div>
        </ErrorCard>
      ) : null}

      {props.loadState.status === 'loading' ? (
        <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
          Loading question…
        </Card>
      ) : null}

      {props.bookmarkStatus === 'error' ? (
        <ErrorCard>Bookmarks unavailable.</ErrorCard>
      ) : null}

      {props.loadState.status === 'ready' && props.question === null ? (
        <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
          No more questions found.
        </Card>
      ) : null}

      {props.question ? (
        <div className="flex flex-col items-end gap-2">
          {sessionInfo?.mode === 'exam' && props.onToggleMarkForReview ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={props.isMarkingForReview || props.isPending}
              onClick={props.onToggleMarkForReview}
            >
              {sessionInfo.isMarkedForReview
                ? 'Unmark review'
                : 'Mark for review'}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={props.bookmarkStatus === 'loading' || props.isPending}
            onClick={props.onToggleBookmark}
          >
            {props.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
          </Button>
          {props.bookmarkMessage ? (
            <div className="text-xs text-muted-foreground" aria-live="polite">
              {props.bookmarkMessage}
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
          disabled={
            props.isPending ||
            props.loadState.status === 'loading' ||
            props.submitResult !== null
          }
          onSelectChoice={props.onSelectChoice}
        />
      ) : null}

      {props.submitResult && !isExamMode ? (
        <Feedback
          isCorrect={props.submitResult.isCorrect}
          explanationMd={props.submitResult.explanationMd}
          choiceExplanations={props.submitResult.choiceExplanations}
        />
      ) : null}

      {props.question ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            className="rounded-full"
            disabled={!props.canSubmit || props.isPending}
            onClick={props.onSubmit}
          >
            Submit
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={props.isPending || props.loadState.status === 'loading'}
            onClick={props.onNextQuestion}
          >
            Next Question
          </Button>
        </div>
      ) : null}
    </div>
  );
}
