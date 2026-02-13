import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import { runTransitionedAsyncAction } from '@/app/(app)/app/practice/shared/question-flow-actions';
import type { AsyncLoadState } from '@/app/(app)/app/shared/load-state';
import type { QuestionOrigin } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import type { GetPreviousAttemptOutput } from '@/src/application/use-cases/get-previous-attempt';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type LoadState = AsyncLoadState;

export type SessionNavigation = {
  questions: ReadonlyArray<{
    slug: string;
    order: number;
    isCorrect: boolean | null;
  }>;
  currentIndex: number;
  sessionId: string;
  from: QuestionOrigin;
};

export function canSubmitQuestionAnswer(input: {
  loadState: LoadState;
  question: GetQuestionBySlugOutput | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
}): boolean {
  if (input.loadState.status === 'loading') return false;
  if (!input.question) return false;
  if (!input.selectedChoiceId) return false;
  if (input.submitResult) return false;
  return true;
}

export async function loadQuestion(input: {
  slug: string;
  getQuestionBySlugFn: (
    input: unknown,
  ) => Promise<ActionResult<GetQuestionBySlugOutput>>;
  createIdempotencyKey: () => string;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setSubmitIdempotencyKey: (key: string | null) => void;
  setQuestionLoadedAt: (loadedAtMs: number | null) => void;
  setQuestion: (question: GetQuestionBySlugOutput | null) => void;
  isMounted?: () => boolean;
}): Promise<void> {
  const isMounted = input.isMounted ?? (() => true);

  input.setLoadState({ status: 'loading' });
  input.setSelectedChoiceId(null);
  input.setSubmitResult(null);
  input.setSubmitIdempotencyKey(null);
  input.setQuestionLoadedAt(null);

  let res: ActionResult<GetQuestionBySlugOutput>;
  try {
    res = await input.getQuestionBySlugFn({ slug: input.slug });
  } catch (error) {
    if (!isMounted()) return;

    input.setLoadState({
      status: 'error',
      message: getThrownErrorMessage(error),
    });
    input.setQuestion(null);
    return;
  }
  if (!isMounted()) return;

  if (!res.ok) {
    input.setLoadState({
      status: 'error',
      message: getActionResultErrorMessage(res),
    });
    input.setQuestion(null);
    return;
  }

  input.setQuestion(res.data);
  input.setQuestionLoadedAt(input.nowMs());
  input.setSubmitIdempotencyKey(input.createIdempotencyKey());
  input.setLoadState({ status: 'ready' });
}

export function createLoadQuestionAction(input: {
  slug: string;
  startTransition: (fn: () => void) => void;
  getQuestionBySlugFn: (
    input: unknown,
  ) => Promise<ActionResult<GetQuestionBySlugOutput>>;
  createIdempotencyKey: () => string;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setSubmitIdempotencyKey: (key: string | null) => void;
  setQuestionLoadedAt: (loadedAtMs: number | null) => void;
  setQuestion: (question: GetQuestionBySlugOutput | null) => void;
  isMounted?: () => boolean;
}): () => void {
  return () => {
    input.startTransition(() => {
      void loadQuestion(input);
    });
  };
}

export async function submitSelectedAnswer(input: {
  question: GetQuestionBySlugOutput | null;
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

export function createSubmitSelectedAnswerAction(input: {
  startTransition: (fn: () => void) => void;
  question: GetQuestionBySlugOutput | null;
  selectedChoiceId: string | null;
  questionLoadedAtMs: number | null;
  submitIdempotencyKey: string | null;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  isMounted?: () => boolean;
}): () => Promise<void> {
  return () =>
    runTransitionedAsyncAction({
      startTransition: input.startTransition,
      run: () => submitSelectedAnswer(input),
    });
}

export function reattemptQuestion(input: {
  createIdempotencyKey: () => string;
  nowMs: () => number;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setSubmitIdempotencyKey: (key: string | null) => void;
  setQuestionLoadedAt: (loadedAtMs: number) => void;
}): void {
  input.setSelectedChoiceId(null);
  input.setSubmitResult(null);
  input.setSubmitIdempotencyKey(input.createIdempotencyKey());
  input.setQuestionLoadedAt(input.nowMs());
}

export async function loadPreviousAttempt(input: {
  questionId: string;
  attemptId?: string;
  sessionId?: string;
  getPreviousAttemptFn: (
    input: unknown,
  ) => Promise<ActionResult<GetPreviousAttemptOutput | null>>;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  isMounted?: () => boolean;
}): Promise<void> {
  const isMounted = input.isMounted ?? (() => true);

  let res: ActionResult<GetPreviousAttemptOutput | null>;
  try {
    res = await input.getPreviousAttemptFn({
      questionId: input.questionId,
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
  } catch {
    // Silently fall back to attempt mode — review is best-effort
    return;
  }
  if (!isMounted()) return;

  if (!res.ok || !res.data) {
    // No previous attempt or error — stay in attempt mode
    return;
  }

  const data = res.data;
  input.setSelectedChoiceId(data.selectedChoiceId);
  input.setSubmitResult({
    attemptId: data.attemptId,
    isCorrect: data.isCorrect,
    correctChoiceId: data.correctChoiceId,
    explanationMd: data.explanationMd,
    choiceExplanations: data.choiceExplanations,
  });
}
