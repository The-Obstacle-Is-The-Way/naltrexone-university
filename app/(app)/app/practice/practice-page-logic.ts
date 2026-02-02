import { getActionResultErrorMessage } from '@/app/(app)/app/practice/practice-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { StartPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

type SetTimeoutFn = (
  fn: () => void,
  ms: number,
) => ReturnType<typeof setTimeout>;

type ClearTimeoutFn = (id: ReturnType<typeof setTimeout>) => void;

export const SESSION_COUNT_MIN = 1;
export const SESSION_COUNT_MAX = 100;

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export type PracticeFilters = {
  tagSlugs: string[];
  difficulties: Array<NextQuestion['difficulty']>;
};

export async function loadNextQuestion(input: {
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  filters: PracticeFilters;
  createIdempotencyKey: () => string;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setSubmitIdempotencyKey: (key: string | null) => void;
  setQuestionLoadedAt: (loadedAtMs: number | null) => void;
  setQuestion: (question: NextQuestion | null) => void;
}): Promise<void> {
  input.setLoadState({ status: 'loading' });
  input.setSelectedChoiceId(null);
  input.setSubmitResult(null);
  input.setSubmitIdempotencyKey(null);
  input.setQuestionLoadedAt(null);

  const res = await input.getNextQuestionFn({
    filters: input.filters,
  });

  if (!res.ok) {
    input.setLoadState({
      status: 'error',
      message: getActionResultErrorMessage(res),
    });
    input.setQuestion(null);
    return;
  }

  input.setQuestion(res.data);
  input.setQuestionLoadedAt(res.data ? input.nowMs() : null);
  input.setSubmitIdempotencyKey(res.data ? input.createIdempotencyKey() : null);
  input.setLoadState({ status: 'ready' });
}

export function createLoadNextQuestionAction(input: {
  startTransition: (fn: () => void) => void;
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  filters: PracticeFilters;
  createIdempotencyKey: () => string;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setSubmitIdempotencyKey: (key: string | null) => void;
  setQuestionLoadedAt: (loadedAtMs: number | null) => void;
  setQuestion: (question: NextQuestion | null) => void;
}): () => void {
  return () => {
    input.startTransition(() => {
      void loadNextQuestion(input);
    });
  };
}

export function createBookmarksEffect(input: {
  bookmarkRetryCount: number;
  getBookmarksFn: (input: unknown) => Promise<
    ActionResult<{
      rows: Array<{ questionId: string }>;
    }>
  >;
  setBookmarkedQuestionIds: (
    next: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void;
  setBookmarkStatus: (status: 'idle' | 'loading' | 'error') => void;
  setBookmarkRetryCount: (next: number | ((prev: number) => number)) => void;
  setTimeoutFn?: SetTimeoutFn;
  clearTimeoutFn?: ClearTimeoutFn;
  logError?: (message: string, context: unknown) => void;
}): () => void {
  const setTimeoutFn: SetTimeoutFn =
    input.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn: ClearTimeoutFn =
    input.clearTimeoutFn ?? ((id) => clearTimeout(id));
  const logError =
    input.logError ??
    ((message: string, context: unknown) => {
      console.error(message, context);
    });

  let mounted = true;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  void (async () => {
    const res = await input.getBookmarksFn({});
    if (!mounted) return;

    if (!res.ok) {
      logError('Failed to load bookmarks', res.error);
      input.setBookmarkStatus('error');

      if (input.bookmarkRetryCount < 2) {
        timeoutId = setTimeoutFn(
          () => {
            if (mounted) {
              input.setBookmarkRetryCount((prev) => prev + 1);
            }
          },
          1000 * (input.bookmarkRetryCount + 1),
        );
      }

      return;
    }

    input.setBookmarkedQuestionIds(
      new Set(res.data.rows.map((row) => row.questionId)),
    );
    input.setBookmarkStatus('idle');
  })();

  return () => {
    mounted = false;
    if (timeoutId !== undefined) clearTimeoutFn(timeoutId);
  };
}

export async function submitAnswerForQuestion(input: {
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  questionLoadedAtMs: number | null;
  submitIdempotencyKey: string | null;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
}): Promise<void> {
  if (!input.question) return;
  if (!input.selectedChoiceId) return;

  input.setLoadState({ status: 'loading' });

  const timeSpentSeconds =
    input.questionLoadedAtMs === null
      ? 0
      : Math.max(
          0,
          Math.floor((input.nowMs() - input.questionLoadedAtMs) / 1000),
        );

  const res = await input.submitAnswerFn({
    questionId: input.question.questionId,
    choiceId: input.selectedChoiceId,
    idempotencyKey: input.submitIdempotencyKey ?? undefined,
    timeSpentSeconds,
  });

  if (!res.ok) {
    input.setLoadState({
      status: 'error',
      message: getActionResultErrorMessage(res),
    });
    return;
  }

  input.setSubmitResult(res.data);
  input.setLoadState({ status: 'ready' });
}

export async function toggleBookmarkForQuestion(input: {
  question: NextQuestion | null;
  toggleBookmarkFn: (
    input: unknown,
  ) => Promise<ActionResult<{ bookmarked: boolean }>>;
  setBookmarkStatus: (status: 'idle' | 'loading' | 'error') => void;
  setLoadState: (state: LoadState) => void;
  setBookmarkedQuestionIds: (
    next: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void;
  onBookmarkToggled?: (bookmarked: boolean) => void;
}): Promise<void> {
  if (!input.question) return;

  const questionId = input.question.questionId;

  input.setBookmarkStatus('loading');

  const res = await input.toggleBookmarkFn({ questionId });
  if (!res.ok) {
    input.setBookmarkStatus('error');
    return;
  }

  input.setBookmarkedQuestionIds((prev) => {
    const next = new Set(prev);
    if (res.data.bookmarked) next.add(questionId);
    else next.delete(questionId);
    return next;
  });

  input.onBookmarkToggled?.(res.data.bookmarked);
  input.setBookmarkStatus('idle');
}

export function selectChoiceIfAllowed(
  submitResult: SubmitAnswerOutput | null,
  setSelectedChoiceId: (choiceId: string) => void,
  choiceId: string,
): void {
  if (submitResult) return;
  setSelectedChoiceId(choiceId);
}

export function handleSessionModeChange(
  setSessionMode: (mode: 'tutor' | 'exam') => void,
  event: { target: { value: string } },
): void {
  const value = event.target.value;
  if (value === 'tutor' || value === 'exam') {
    setSessionMode(value);
  }
}

export function handleSessionCountChange(
  setSessionCount: (count: number) => void,
  event: { target: { value: string } },
): void {
  const parsed = Number(event.target.value);
  if (!Number.isFinite(parsed)) {
    setSessionCount(SESSION_COUNT_MIN);
    return;
  }

  const clamped = Math.min(
    SESSION_COUNT_MAX,
    Math.max(SESSION_COUNT_MIN, Math.trunc(parsed)),
  );
  setSessionCount(clamped);
}

export async function startSession(input: {
  sessionMode: 'tutor' | 'exam';
  sessionCount: number;
  filters: PracticeFilters;
  idempotencyKey: string;
  createIdempotencyKey: () => string;
  setIdempotencyKey: (key: string) => void;
  startPracticeSessionFn: (
    input: unknown,
  ) => Promise<ActionResult<StartPracticeSessionOutput>>;
  setSessionStartStatus: (status: 'idle' | 'loading' | 'error') => void;
  setSessionStartError: (message: string | null) => void;
  navigateTo: (url: string) => void;
}): Promise<void> {
  input.setSessionStartStatus('loading');
  input.setSessionStartError(null);

  const res = await input.startPracticeSessionFn({
    mode: input.sessionMode,
    count: input.sessionCount,
    idempotencyKey: input.idempotencyKey,
    tagSlugs: input.filters.tagSlugs,
    difficulties: input.filters.difficulties,
  });

  if (!res.ok) {
    input.setSessionStartStatus('error');
    input.setSessionStartError(getActionResultErrorMessage(res));
    input.setIdempotencyKey(input.createIdempotencyKey());
    return;
  }

  input.navigateTo(`/app/practice/${res.data.sessionId}`);
}
