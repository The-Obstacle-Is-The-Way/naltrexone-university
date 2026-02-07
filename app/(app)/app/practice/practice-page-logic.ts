import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import type { PracticeFilters } from './practice-page-types';

export { createBookmarksEffect } from './practice-page-bookmarks';
export {
  handleSessionCountChange,
  handleSessionModeChange,
  SESSION_COUNT_MAX,
  SESSION_COUNT_MIN,
  startSession,
} from './practice-page-session-start';
export type { PracticeFilters } from './practice-page-types';

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export function canSubmitAnswer(input: {
  loadState: LoadState;
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
}): boolean {
  if (input.loadState.status === 'loading') return false;
  if (!input.question) return false;
  if (!input.selectedChoiceId) return false;
  if (input.submitResult) return false;
  return true;
}

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
  createRequestSequenceId?: () => number;
  isLatestRequest?: (requestId: number) => boolean;
  isMounted?: () => boolean;
}): Promise<void> {
  const isMounted = input.isMounted ?? (() => true);
  const requestId = input.createRequestSequenceId?.();
  const canCommit = () => {
    if (!isMounted()) return false;
    if (requestId === undefined) return true;
    return input.isLatestRequest?.(requestId) ?? true;
  };

  input.setLoadState({ status: 'loading' });
  input.setSelectedChoiceId(null);
  input.setSubmitResult(null);
  input.setSubmitIdempotencyKey(null);
  input.setQuestionLoadedAt(null);

  let res: ActionResult<NextQuestion | null>;
  try {
    res = await input.getNextQuestionFn({
      filters: input.filters,
    });
  } catch (error) {
    if (!canCommit()) return;

    input.setLoadState({
      status: 'error',
      message: getThrownErrorMessage(error),
    });
    input.setQuestion(null);
    input.setSelectedChoiceId(null);
    input.setSubmitResult(null);
    input.setSubmitIdempotencyKey(null);
    input.setQuestionLoadedAt(null);
    return;
  }
  if (!canCommit()) return;

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
  createRequestSequenceId?: () => number;
  isLatestRequest?: (requestId: number) => boolean;
  isMounted?: () => boolean;
}): () => void {
  return () => {
    input.startTransition(() => {
      void loadNextQuestion(input);
    });
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
  isMounted?: () => boolean;
}): Promise<void> {
  if (!input.question) return;
  if (!input.selectedChoiceId) return;

  const isMounted = input.isMounted ?? (() => true);

  input.setLoadState({ status: 'loading' });

  const timeSpentSeconds =
    input.questionLoadedAtMs === null
      ? 0
      : Math.max(
          0,
          Math.floor((input.nowMs() - input.questionLoadedAtMs) / 1000),
        );

  let res: ActionResult<SubmitAnswerOutput>;
  try {
    res = await input.submitAnswerFn({
      questionId: input.question.questionId,
      choiceId: input.selectedChoiceId,
      idempotencyKey: input.submitIdempotencyKey ?? undefined,
      timeSpentSeconds,
    });
  } catch (error) {
    if (!isMounted()) return;

    input.setLoadState({
      status: 'error',
      message: getThrownErrorMessage(error),
    });
    return;
  }
  if (!isMounted()) return;

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
  bookmarkIdempotencyKey?: string | null;
  createIdempotencyKey?: () => string;
  setBookmarkIdempotencyKey?: (key: string) => void;
  toggleBookmarkFn: (
    input: unknown,
  ) => Promise<ActionResult<{ bookmarked: boolean }>>;
  setBookmarkStatus: (status: 'idle' | 'loading' | 'error') => void;
  setBookmarkedQuestionIds: (
    next: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void;
  onBookmarkToggled?: (bookmarked: boolean) => void;
  isMounted?: () => boolean;
}): Promise<void> {
  if (!input.question) return;

  const isMounted = input.isMounted ?? (() => true);

  const questionId = input.question.questionId;
  const requestIdempotencyKey =
    input.bookmarkIdempotencyKey ?? input.createIdempotencyKey?.();

  input.setBookmarkStatus('loading');

  let res: ActionResult<{ bookmarked: boolean }>;
  try {
    res = await input.toggleBookmarkFn({
      questionId,
      idempotencyKey: requestIdempotencyKey ?? undefined,
    });
  } catch {
    if (!isMounted()) return;
    input.setBookmarkStatus('error');
    return;
  }
  if (!isMounted()) return;
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
  if (input.setBookmarkIdempotencyKey && input.createIdempotencyKey) {
    input.setBookmarkIdempotencyKey(input.createIdempotencyKey());
  }
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
