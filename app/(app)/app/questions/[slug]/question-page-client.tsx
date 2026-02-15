'use client';

import Link from 'next/link';
import { ErrorCard } from '@/components/error-card';
import { Feedback } from '@/components/question/feedback';
import { QuestionCard } from '@/components/question/question-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  type QuestionMode,
  type QuestionOrigin,
  ROUTES,
  toPracticeSessionRoute,
  toQuestionRoute,
} from '@/lib/routes';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import type { LoadState, SessionNavigation } from './question-page-logic';
import { useQuestionPageController } from './use-question-page-controller';

function parseQuestionOrigin(value: string | undefined): QuestionOrigin | null {
  if (value === 'dashboard') return value;
  if (value === 'bookmarks') return value;
  if (value === 'practice') return value;
  if (value === 'history') return value;
  return null;
}

function parseQuestionMode(value: string | undefined): QuestionMode | null {
  if (value === 'review') return value;
  return null;
}

function parseHistoryHref(value: string | undefined): string | null {
  if (!value) return null;
  const prefix = `${ROUTES.APP_HISTORY}?`;
  if (!value.startsWith(prefix)) return null;
  try {
    const parsed = new URL(value, 'http://localhost');
    const tab = parsed.searchParams.get('tab');
    if (tab !== 'sessions' && tab !== 'questions') return null;
    return value;
  } catch {
    return null;
  }
}

function getOriginUi(
  origin: QuestionOrigin | null,
  sessionId?: string,
  historyHref?: string,
): {
  backHref: string;
  backLabel: string;
  subtitle: string;
} {
  const resolvedOrigin = origin ?? 'dashboard';
  const resolvedHistoryHref = parseHistoryHref(historyHref);

  if (resolvedOrigin === 'history') {
    return {
      backHref:
        resolvedHistoryHref ??
        (sessionId
          ? `${ROUTES.APP_HISTORY}?tab=sessions`
          : `${ROUTES.APP_HISTORY}?tab=questions`),
      backLabel: 'Back to History',
      subtitle: 'Reviewing a question from your history.',
    };
  }

  if (resolvedOrigin === 'bookmarks') {
    return {
      backHref: ROUTES.APP_BOOKMARKS,
      backLabel: 'Back to Bookmarks',
      subtitle: 'Reattempt a question from your bookmarks.',
    };
  }

  if (resolvedOrigin === 'practice') {
    return {
      backHref: sessionId
        ? toPracticeSessionRoute(sessionId)
        : ROUTES.APP_PRACTICE,
      backLabel: sessionId ? 'Back to Session' : 'Back to Practice',
      subtitle: 'Review a question from your practice history.',
    };
  }

  return {
    backHref: ROUTES.APP_DASHBOARD,
    backLabel: 'Back to Dashboard',
    subtitle: 'Review a question from your recent activity.',
  };
}

function SessionNavigationBar({
  navigation,
  historyHref,
}: {
  navigation: SessionNavigation;
  historyHref?: string;
}) {
  const { questions, currentIndex, sessionId, from } = navigation;
  const total = questions.length;
  if (total === 0) return null;
  if (currentIndex < 0 || currentIndex >= total) return null;

  const prev = currentIndex > 0 ? questions[currentIndex - 1] : null;
  const next =
    currentIndex < questions.length - 1 ? questions[currentIndex + 1] : null;

  const linkClassName =
    'text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';

  return (
    <div className="flex items-center justify-between">
      {prev ? (
        <Link
          href={toQuestionRoute(prev.slug, {
            from,
            mode: 'review',
            sessionId,
            historyHref,
          })}
          className={linkClassName}
        >
          ← Previous
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}

      <span className="text-sm text-muted-foreground">
        Question {currentIndex + 1} of {total}
      </span>

      {next ? (
        <Link
          href={toQuestionRoute(next.slug, {
            from,
            mode: 'review',
            sessionId,
            historyHref,
          })}
          className={linkClassName}
        >
          Next →
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}

export type QuestionViewProps = {
  loadState: LoadState;
  question: GetQuestionBySlugOutput | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  sessionNavigation: SessionNavigation | null;
  canSubmit: boolean;
  isPending: boolean;
  origin?: QuestionOrigin | null;
  sessionId?: string;
  historyHref?: string;
  onTryAgain: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onReattempt: () => void;
};

export function QuestionView(props: QuestionViewProps) {
  const correctChoiceId = props.submitResult?.correctChoiceId ?? null;
  const originUi = getOriginUi(
    props.origin ?? null,
    props.sessionId,
    props.historyHref,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            Question
          </h1>
          <p className="mt-1 text-muted-foreground">{originUi.subtitle}</p>
        </div>
        <Link
          href={originUi.backHref}
          className="rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        >
          {originUi.backLabel}
        </Link>
      </div>

      {props.sessionNavigation ? (
        <SessionNavigationBar
          navigation={props.sessionNavigation}
          historyHref={props.historyHref}
        />
      ) : null}

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
              <Link href={originUi.backHref}>{originUi.backLabel}</Link>
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function QuestionPageClient({
  slug,
  from,
  mode,
  sessionId,
  attemptId,
  historyHref,
}: {
  slug: string;
  from?: string;
  mode?: string;
  sessionId?: string;
  attemptId?: string;
  historyHref?: string;
}) {
  const origin = parseQuestionOrigin(from);
  const controller = useQuestionPageController({
    slug,
    mode: parseQuestionMode(mode),
    from: origin,
    sessionId,
    attemptId,
  });
  return (
    <QuestionView
      {...controller}
      origin={origin}
      sessionId={sessionId}
      historyHref={historyHref}
    />
  );
}
