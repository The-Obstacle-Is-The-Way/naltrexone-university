'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import { Feedback } from '@/components/question/Feedback';
import { QuestionCard } from '@/components/question/QuestionCard';
import { Button } from '@/components/ui/button';
import { useIsMounted } from '@/lib/use-is-mounted';
import {
  getBookmarks,
  toggleBookmark,
} from '@/src/adapters/controllers/bookmark-controller';
import {
  endPracticeSession,
  type GetIncompletePracticeSessionOutput,
  getIncompletePracticeSession,
  startPracticeSession,
} from '@/src/adapters/controllers/practice-controller';
import {
  getNextQuestion,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import {
  getTags,
  type TagRow,
} from '@/src/adapters/controllers/tag-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { navigateTo } from './client-navigation';
import {
  canSubmitAnswer,
  createBookmarksEffect,
  createLoadNextQuestionAction,
  handleSessionCountChange,
  handleSessionModeChange,
  type LoadState,
  type PracticeFilters,
  SESSION_COUNT_MAX,
  SESSION_COUNT_MIN,
  selectChoiceIfAllowed,
  startSession,
  submitAnswerForQuestion,
  toggleBookmarkForQuestion,
} from './practice-page-logic';

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
  bookmarkMessage?: string | null;
  canSubmit: boolean;
  onEndSession?: () => void;
  onTryAgain: () => void;
  onToggleBookmark: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onNextQuestion: () => void;
};

export type PracticeSessionStarterProps = {
  sessionMode: 'tutor' | 'exam';
  sessionCount: number;
  filters: PracticeFilters;
  tagLoadStatus: 'idle' | 'loading' | 'error';
  availableTags: TagRow[];
  sessionStartStatus: 'idle' | 'loading' | 'error';
  sessionStartError: string | null;
  isPending: boolean;
  onToggleDifficulty: (difficulty: NextQuestion['difficulty']) => void;
  onTagSlugsChange: (event: {
    target: { selectedOptions: ArrayLike<{ value: string }> };
  }) => void;
  onSessionModeChange: (event: { target: { value: string } }) => void;
  onSessionCountChange: (event: { target: { value: string } }) => void;
  onStartSession: () => void;
};

type IncompletePracticeSession =
  NonNullable<GetIncompletePracticeSessionOutput>;

export function IncompleteSessionCard(input: {
  session: IncompletePracticeSession;
  isPending: boolean;
  onAbandon: () => void;
}) {
  const modeLabel = input.session.mode === 'exam' ? 'Exam mode' : 'Tutor mode';

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">
            Continue session
          </div>
          <div className="text-sm text-muted-foreground">
            {modeLabel} • {input.session.answeredCount}/
            {input.session.totalCount} answered
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild type="button" className="rounded-full">
            <Link href={`/app/practice/${input.session.sessionId}`}>
              Resume session
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={input.isPending}
            onClick={input.onAbandon}
          >
            Abandon session
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PracticeSessionStarter(props: PracticeSessionStarterProps) {
  const difficulties = ['easy', 'medium', 'hard'] satisfies Array<
    NextQuestion['difficulty']
  >;
  const tagsByKind = useMemo(() => {
    const map = new Map<string, TagRow[]>();
    for (const tag of props.availableTags) {
      const list = map.get(tag.kind) ?? [];
      list.push(tag);
      map.set(tag.kind, list);
    }
    return map;
  }, [props.availableTags]);

  const tagKindLabels: Record<TagRow['kind'], string> = {
    domain: 'Domain',
    topic: 'Topic',
    substance: 'Substance',
    treatment: 'Treatment',
    diagnosis: 'Diagnosis',
  };

  return (
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
              value={props.sessionMode}
              onChange={props.onSessionModeChange}
            >
              <option value="tutor">Tutor</option>
              <option value="exam">Exam</option>
            </select>
          </label>

          <label className="text-sm text-muted-foreground">
            <span className="mr-2">Count</span>
            <input
              type="number"
              min={SESSION_COUNT_MIN}
              max={SESSION_COUNT_MAX}
              className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={props.sessionCount}
              onChange={props.onSessionCountChange}
            />
          </label>

          <Button
            type="button"
            className="rounded-full"
            disabled={props.sessionStartStatus === 'loading' || props.isPending}
            onClick={props.onStartSession}
          >
            {props.sessionStartStatus === 'loading' || props.isPending
              ? 'Starting…'
              : 'Start session'}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-sm font-medium text-foreground">Difficulty</div>
          <div className="mt-2 flex flex-wrap gap-3">
            {difficulties.map((difficulty) => {
              const checked = props.filters.difficulties.includes(difficulty);
              return (
                <label
                  key={difficulty}
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={checked}
                    onChange={() => props.onToggleDifficulty(difficulty)}
                  />
                  <span className="capitalize">{difficulty}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Leave empty to include all difficulties.
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-foreground">Tags</div>
          {props.tagLoadStatus === 'loading' ? (
            <div className="mt-2 text-sm text-muted-foreground">
              Loading tags…
            </div>
          ) : null}
          {props.tagLoadStatus === 'error' ? (
            <div className="mt-2 text-sm text-destructive">
              Tags unavailable.
            </div>
          ) : null}
          {props.tagLoadStatus === 'idle' ? (
            <>
              <select
                multiple
                className="mt-2 h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={props.filters.tagSlugs}
                onChange={props.onTagSlugsChange}
              >
                {Array.from(tagsByKind.entries()).map(([kind, tags]) => (
                  <optgroup
                    key={kind}
                    label={
                      kind in tagKindLabels
                        ? tagKindLabels[kind as TagRow['kind']]
                        : kind
                    }
                  >
                    {tags.map((tag) => (
                      <option key={tag.slug} value={tag.slug}>
                        {tag.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="mt-1 text-xs text-muted-foreground">
                Leave empty to include all tags.
              </div>
            </>
          ) : null}
        </div>
      </div>

      {props.sessionStartStatus === 'error' && props.sessionStartError ? (
        <div className="mt-3 text-sm text-destructive">
          {props.sessionStartError}
        </div>
      ) : null}
    </div>
  );
}

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
                End session
              </Button>
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
          <Button
            type="button"
            variant="outline"
            className="mt-4 rounded-full"
            onClick={props.onTryAgain}
          >
            Try again
          </Button>
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
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={props.bookmarkStatus === 'loading' || props.isPending}
            onClick={props.onToggleBookmark}
          >
            {props.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
          </Button>
          {props.bookmarkStatus === 'error' ? (
            <div className="text-xs text-destructive">
              Bookmarks unavailable.
            </div>
          ) : null}
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
        />
      ) : null}

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
    </div>
  );
}

export default function PracticePage() {
  const [question, setQuestion] = useState<NextQuestion | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitAnswerOutput | null>(
    null,
  );
  const [filters, setFilters] = useState<PracticeFilters>({
    tagSlugs: [],
    difficulties: [],
  });
  const [tagLoadStatus, setTagLoadStatus] = useState<
    'idle' | 'loading' | 'error'
  >('loading');
  const [availableTags, setAvailableTags] = useState<TagRow[]>([]);
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
  const [questionLoadedAt, setQuestionLoadedAt] = useState<number | null>(null);
  const [submitIdempotencyKey, setSubmitIdempotencyKey] = useState<
    string | null
  >(null);
  const [sessionMode, setSessionMode] = useState<'tutor' | 'exam'>('tutor');
  const [sessionCount, setSessionCount] = useState(20);
  const [startSessionIdempotencyKey, setStartSessionIdempotencyKey] = useState(
    () => crypto.randomUUID(),
  );
  const [sessionStartStatus, setSessionStartStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');
  const [sessionStartError, setSessionStartError] = useState<string | null>(
    null,
  );
  const [incompleteSessionStatus, setIncompleteSessionStatus] = useState<
    'idle' | 'loading' | 'error'
  >('loading');
  const [incompleteSessionError, setIncompleteSessionError] = useState<
    string | null
  >(null);
  const [incompleteSession, setIncompleteSession] =
    useState<IncompletePracticeSession | null>(null);
  const isMounted = useIsMounted();

  const loadNext = useMemo(
    () =>
      createLoadNextQuestionAction({
        startTransition,
        getNextQuestionFn: getNextQuestion,
        filters,
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
    [filters, isMounted],
  );

  useEffect(loadNext, [loadNext]);

  useEffect(() => {
    let mounted = true;
    setTagLoadStatus('loading');

    void (async () => {
      const res = await getTags({});
      if (!mounted) return;

      if (!res.ok) {
        setTagLoadStatus('error');
        return;
      }

      setAvailableTags(res.data.rows);
      setTagLoadStatus('idle');
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setIncompleteSessionStatus('loading');
    setIncompleteSessionError(null);

    void (async () => {
      let res: Awaited<ReturnType<typeof getIncompletePracticeSession>>;
      try {
        res = await getIncompletePracticeSession({});
      } catch (error) {
        if (!mounted) return;
        setIncompleteSessionStatus('error');
        setIncompleteSessionError(getThrownErrorMessage(error));
        return;
      }
      if (!mounted) return;

      if (!res.ok) {
        setIncompleteSessionStatus('error');
        setIncompleteSessionError(getActionResultErrorMessage(res));
        return;
      }

      setIncompleteSession(res.data);
      setIncompleteSessionStatus('idle');
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return createBookmarksEffect({
      bookmarkRetryCount,
      getBookmarksFn: getBookmarks,
      setBookmarkedQuestionIds,
      setBookmarkStatus,
      setBookmarkRetryCount,
    });
  }, [bookmarkRetryCount]);

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

  const isBookmarked = question
    ? bookmarkedQuestionIds.has(question.questionId)
    : false;

  const onSubmit = useMemo(
    () =>
      submitAnswerForQuestion.bind(null, {
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

  const onSelectChoice = useMemo(
    () => selectChoiceIfAllowed.bind(null, submitResult, setSelectedChoiceId),
    [submitResult],
  );

  const onSessionModeChange = useMemo(
    () =>
      handleSessionModeChange.bind(null, (mode) => {
        setSessionMode(mode);
        setStartSessionIdempotencyKey(crypto.randomUUID());
      }),
    [],
  );

  const onSessionCountChange = useMemo(
    () =>
      handleSessionCountChange.bind(null, (count) => {
        setSessionCount(count);
        setStartSessionIdempotencyKey(crypto.randomUUID());
      }),
    [],
  );

  const onTagSlugsChange = useMemo(
    () =>
      ((event: {
        target: { selectedOptions: ArrayLike<{ value: string }> };
      }) => {
        const selected = Array.from(event.target.selectedOptions).map(
          (o) => o.value,
        );
        setFilters((prev) => ({ ...prev, tagSlugs: selected }));
        setStartSessionIdempotencyKey(crypto.randomUUID());
      }) satisfies PracticeSessionStarterProps['onTagSlugsChange'],
    [],
  );

  const onToggleDifficulty = useMemo(
    () =>
      ((difficulty: NextQuestion['difficulty']) => {
        setFilters((prev) => {
          const existing = prev.difficulties;
          const next = existing.includes(difficulty)
            ? existing.filter((d) => d !== difficulty)
            : [...existing, difficulty];

          return { ...prev, difficulties: next };
        });
        setStartSessionIdempotencyKey(crypto.randomUUID());
      }) satisfies PracticeSessionStarterProps['onToggleDifficulty'],
    [],
  );

  const onStartSession = useMemo(
    () =>
      startSession.bind(null, {
        sessionMode,
        sessionCount,
        filters,
        idempotencyKey: startSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
        setIdempotencyKey: setStartSessionIdempotencyKey,
        startPracticeSessionFn: startPracticeSession,
        setSessionStartStatus,
        setSessionStartError,
        navigateTo,
        isMounted,
      }),
    [filters, sessionMode, sessionCount, startSessionIdempotencyKey, isMounted],
  );

  const onAbandonIncompleteSession = useCallback(async () => {
    if (!incompleteSession) return;

    setIncompleteSessionStatus('loading');
    setIncompleteSessionError(null);

    let res: Awaited<ReturnType<typeof endPracticeSession>>;
    try {
      res = await endPracticeSession({
        sessionId: incompleteSession.sessionId,
      });
    } catch (error) {
      if (!isMounted()) return;
      setIncompleteSessionStatus('error');
      setIncompleteSessionError(getThrownErrorMessage(error));
      return;
    }
    if (!isMounted()) return;

    if (!res.ok) {
      setIncompleteSessionStatus('error');
      setIncompleteSessionError(getActionResultErrorMessage(res));
      return;
    }

    setIncompleteSession(null);
    setIncompleteSessionStatus('idle');
  }, [incompleteSession, isMounted]);

  return (
    <PracticeView
      topContent={
        <div className="space-y-4">
          {incompleteSession ? (
            <IncompleteSessionCard
              session={incompleteSession}
              isPending={isPending || incompleteSessionStatus === 'loading'}
              onAbandon={() => {
                void onAbandonIncompleteSession();
              }}
            />
          ) : null}
          {incompleteSessionStatus === 'error' && incompleteSessionError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {incompleteSessionError}
            </div>
          ) : null}
          {!incompleteSession && (
            <PracticeSessionStarter
              sessionMode={sessionMode}
              sessionCount={sessionCount}
              filters={filters}
              tagLoadStatus={tagLoadStatus}
              availableTags={availableTags}
              sessionStartStatus={sessionStartStatus}
              sessionStartError={sessionStartError}
              isPending={isPending}
              onToggleDifficulty={onToggleDifficulty}
              onTagSlugsChange={onTagSlugsChange}
              onSessionModeChange={onSessionModeChange}
              onSessionCountChange={onSessionCountChange}
              onStartSession={onStartSession}
            />
          )}
        </div>
      }
      loadState={loadState}
      question={question}
      selectedChoiceId={selectedChoiceId}
      submitResult={submitResult}
      isPending={isPending}
      bookmarkStatus={bookmarkStatus}
      isBookmarked={isBookmarked}
      bookmarkMessage={bookmarkMessage}
      canSubmit={canSubmit}
      onTryAgain={loadNext}
      onToggleBookmark={onToggleBookmark}
      onSelectChoice={onSelectChoice}
      onSubmit={onSubmit}
      onNextQuestion={loadNext}
    />
  );
}
