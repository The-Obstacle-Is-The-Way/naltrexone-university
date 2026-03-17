import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import type { PracticeFilters } from './practice-page-types';
import {
  createTransitionedLoadAction,
  runLoadQuestionFlow,
  runSubmitAnswerFlow,
} from './shared/question-flow-actions';

export { toggleBookmarkForQuestion } from '@/app/(app)/app/shared/bookmark-toggle';
export { createBookmarksEffect } from './practice-page-bookmarks';
export {
  createDifficultyChangeHandler,
  createSessionCountBlurHandler,
  createSessionCountChangeHandler,
  createSessionModeChangeHandler,
  createStatusChangeHandler,
  createToggleTagHandler,
  DEFAULT_SESSION_COUNT,
  handleSessionCountBlur,
  handleSessionCountChange,
  handleSessionModeChange,
  SESSION_COUNT_MAX,
  SESSION_COUNT_MIN,
  startSession,
} from './practice-page-session-start';
export type { PracticeFilters } from './practice-page-types';
export { statusDisplayLabel } from './practice-page-types';

export type LoadState = AsyncLoadStateWithIdle;

export function canSubmitAnswer(input: {
  loadState: LoadState;
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  isAnswered: boolean;
  submitResult: SubmitAnswerOutput | null;
}): boolean {
  if (input.loadState.status === 'loading') return false;
  if (!input.question) return false;
  if (!input.selectedChoiceId) return false;
  if (input.isAnswered) return false;
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
  const serverFilters = {
    tagSlugs: input.filters.tagSlugs,
    difficulties: input.filters.difficulty ? [input.filters.difficulty] : [],
    statuses: [input.filters.status],
  };

  return runLoadQuestionFlow({
    requestInput: { filters: serverFilters },
    getQuestionFn: input.getNextQuestionFn,
    createIdempotencyKey: input.createIdempotencyKey,
    nowMs: input.nowMs,
    setLoadState: input.setLoadState,
    setSelectedChoiceId: input.setSelectedChoiceId,
    setSubmitResult: input.setSubmitResult,
    setSubmitIdempotencyKey: input.setSubmitIdempotencyKey,
    setQuestionLoadedAt: input.setQuestionLoadedAt,
    setQuestion: input.setQuestion,
    createRequestSequenceId: input.createRequestSequenceId,
    isLatestRequest: input.isLatestRequest,
    isMounted: input.isMounted,
  });
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
  return createTransitionedLoadAction({
    startTransition: input.startTransition,
    run: () => loadNextQuestion(input),
  });
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
  createRequestSequenceId?: () => number;
  isLatestRequest?: (requestId: number) => boolean;
  isMounted?: () => boolean;
}): Promise<void> {
  return runSubmitAnswerFlow({
    question: input.question,
    selectedChoiceId: input.selectedChoiceId,
    questionLoadedAtMs: input.questionLoadedAtMs,
    submitIdempotencyKey: input.submitIdempotencyKey,
    submitAnswerFn: input.submitAnswerFn,
    buildSubmitInput: ({
      question,
      selectedChoiceId,
      idempotencyKey,
      timeSpentSeconds,
    }) => ({
      questionId: question.questionId,
      choiceId: selectedChoiceId,
      idempotencyKey: idempotencyKey ?? undefined,
      timeSpentSeconds,
    }),
    nowMs: input.nowMs,
    setLoadState: input.setLoadState,
    setSubmitResult: input.setSubmitResult,
    createRequestSequenceId: input.createRequestSequenceId,
    isLatestRequest: input.isLatestRequest,
    isMounted: input.isMounted,
  });
}

export { selectChoiceIfAllowed } from '../shared/question-guards';
