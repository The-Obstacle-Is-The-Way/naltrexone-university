import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import { runTransitionedAsyncAction } from '@/app/(app)/app/practice/shared/question-flow-actions';
import type { AsyncLoadState } from '@/app/(app)/app/shared/load-state';
import type { QuestionMode, QuestionOrigin } from '@/lib/routes';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import type { GetPreviousAttemptOutput } from '@/src/application/use-cases/get-previous-attempt';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

const QUESTION_LOAD_TIMEOUT_MS = 15_000;
const ANSWER_SUBMIT_TIMEOUT_MS = 15_000;
const PREVIOUS_ATTEMPT_TIMEOUT_MS = 10_000;

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

export type SessionUnansweredReveal = {
  correctChoiceId: string;
  explanationMd: string | null;
  referenceMd: string | null;
  choiceExplanations: SubmitAnswerOutput['choiceExplanations'];
};

/**
 * Returns false when the user is reviewing a specific session (read-only).
 * Gates both the Submit button (via canSubmitQuestionAnswer) and the
 * Try Again/reattempt binding.
 */
export function canReattemptInContext(input: {
  mode: QuestionMode | null | undefined;
  sessionId?: string;
}): boolean {
  return !(input.mode === 'review' && typeof input.sessionId === 'string');
}

export function canSubmitQuestionAnswer(input: {
  loadState: LoadState;
  question: GetQuestionBySlugOutput | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  mode?: QuestionMode | null;
  sessionId?: string;
}): boolean {
  if (
    !canReattemptInContext({ mode: input.mode, sessionId: input.sessionId })
  ) {
    return false;
  }
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
  setSessionUnansweredReveal?: (reveal: SessionUnansweredReveal | null) => void;
  isMounted?: () => boolean;
}): Promise<void> {
  const isMounted = input.isMounted ?? (() => true);

  input.setLoadState({ status: 'loading' });
  input.setSelectedChoiceId(null);
  input.setSubmitResult(null);
  input.setSubmitIdempotencyKey(null);
  input.setQuestionLoadedAt(null);
  input.setSessionUnansweredReveal?.(null);

  let res: ActionResult<GetQuestionBySlugOutput>;
  try {
    res = await withTimeout(
      input.getQuestionBySlugFn({ slug: input.slug }),
      QUESTION_LOAD_TIMEOUT_MS,
    );
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
  setSessionUnansweredReveal?: (reveal: SessionUnansweredReveal | null) => void;
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
  mode?: QuestionMode | null;
  sessionId?: string;
  questionLoadedAtMs: number | null;
  submitIdempotencyKey: string | null;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  isMounted?: () => boolean;
}): Promise<void> {
  if (
    !canReattemptInContext({ mode: input.mode, sessionId: input.sessionId })
  ) {
    return;
  }
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
    res = await withTimeout(
      input.submitAnswerFn({
        questionId: input.question.questionId,
        choiceId: input.selectedChoiceId,
        idempotencyKey: input.submitIdempotencyKey ?? undefined,
        timeSpentSeconds,
      }),
      ANSWER_SUBMIT_TIMEOUT_MS,
    );
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
  mode?: QuestionMode | null;
  sessionId?: string;
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
  setSessionUnansweredReveal?: (reveal: SessionUnansweredReveal | null) => void;
}): void {
  input.setSelectedChoiceId(null);
  input.setSubmitResult(null);
  input.setSubmitIdempotencyKey(input.createIdempotencyKey());
  input.setQuestionLoadedAt(input.nowMs());
  input.setSessionUnansweredReveal?.(null);
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
  setSessionUnansweredReveal?: (reveal: SessionUnansweredReveal | null) => void;
  isMounted?: () => boolean;
}): Promise<void> {
  const isMounted = input.isMounted ?? (() => true);
  const setSessionUnansweredReveal =
    input.setSessionUnansweredReveal ?? (() => undefined);
  setSessionUnansweredReveal(null);

  let res: ActionResult<GetPreviousAttemptOutput | null>;
  try {
    res = await withTimeout(
      input.getPreviousAttemptFn({
        questionId: input.questionId,
        ...(input.attemptId ? { attemptId: input.attemptId } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      }),
      PREVIOUS_ATTEMPT_TIMEOUT_MS,
    );
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
  if (data.kind === 'session_unanswered') {
    input.setSelectedChoiceId(null);
    input.setSubmitResult(null);
    setSessionUnansweredReveal({
      correctChoiceId: data.correctChoiceId,
      explanationMd: data.explanationMd,
      referenceMd: data.referenceMd ?? null,
      choiceExplanations: data.choiceExplanations,
    });
    return;
  }

  setSessionUnansweredReveal(null);
  input.setSelectedChoiceId(data.selectedChoiceId);
  input.setSubmitResult({
    attemptId: data.attemptId,
    isCorrect: data.isCorrect,
    correctChoiceId: data.correctChoiceId,
    explanationMd: data.explanationMd,
    referenceMd: data.referenceMd ?? null,
    choiceExplanations: data.choiceExplanations,
  });
}
