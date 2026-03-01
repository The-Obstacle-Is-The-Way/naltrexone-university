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
import type { AttemptRetryOrigin } from '@/src/domain/entities';

const QUESTION_LOAD_TIMEOUT_MS = 15_000;
const ANSWER_SUBMIT_TIMEOUT_MS = 15_000;
const PREVIOUS_ATTEMPT_TIMEOUT_MS = 10_000;

export type LoadState = AsyncLoadState;

export type SessionNavigation = {
  questions: ReadonlyArray<{
    slug: string;
    order: number;
    isCorrect: boolean | null;
    wasRetried?: boolean;
  }>;
  currentIndex: number;
  sessionId?: string;
  from: QuestionOrigin;
  historySequence?: readonly string[] | null;
};

export type SessionUnansweredReveal = {
  correctChoiceId: string;
  explanationMd: string | null;
  referenceMd: string | null;
  choiceExplanations: SubmitAnswerOutput['choiceExplanations'];
};

export type ReviewHydrationState =
  | 'attempt'
  | 'session_unanswered'
  | 'no_prior_attempt'
  | 'hydration_error';

export type RetryProvenance = {
  retryOfAttemptId: string | null;
  retryOrigin: AttemptRetryOrigin;
  retrySessionId: string | null;
};

export function normalizeReviewIdentifiers(input: {
  mode?: QuestionMode | null;
  sessionId?: string;
  attemptId?: string;
}): {
  sessionId?: string;
  attemptId?: string;
  normalized: boolean;
} {
  if (
    input.mode === 'review' &&
    typeof input.sessionId === 'string' &&
    typeof input.attemptId === 'string'
  ) {
    return {
      sessionId: input.sessionId,
      attemptId: undefined,
      normalized: true,
    };
  }

  return {
    sessionId: input.sessionId,
    attemptId: input.attemptId,
    normalized: false,
  };
}

export function canSubmitQuestionAnswer(input: {
  loadState: LoadState;
  question: GetQuestionBySlugOutput | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  mode?: QuestionMode | null;
  sessionId?: string;
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
  retryProvenance?: RetryProvenance | null;
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
  const submitInput: {
    questionId: string;
    choiceId: string;
    idempotencyKey?: string;
    timeSpentSeconds: number;
    retryOfAttemptId?: string;
    retryOrigin?: AttemptRetryOrigin;
    retrySessionId?: string;
  } = {
    questionId: input.question.questionId,
    choiceId: input.selectedChoiceId,
    idempotencyKey: input.submitIdempotencyKey ?? undefined,
    timeSpentSeconds,
  };

  if (input.retryProvenance) {
    submitInput.retryOrigin = input.retryProvenance.retryOrigin;
    if (input.retryProvenance.retryOfAttemptId !== null) {
      submitInput.retryOfAttemptId = input.retryProvenance.retryOfAttemptId;
    }
    if (input.retryProvenance.retrySessionId !== null) {
      submitInput.retrySessionId = input.retryProvenance.retrySessionId;
    }
  }

  try {
    res = await withTimeout(
      input.submitAnswerFn(submitInput),
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
  retryProvenance?: RetryProvenance | null;
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
  setRetryProvenance?: (provenance: RetryProvenance | null) => void;
  retryProvenance?: RetryProvenance | null;
}): void {
  input.setSelectedChoiceId(null);
  input.setSubmitResult(null);
  input.setSubmitIdempotencyKey(input.createIdempotencyKey());
  input.setQuestionLoadedAt(input.nowMs());
  input.setSessionUnansweredReveal?.(null);
  input.setRetryProvenance?.(input.retryProvenance ?? null);
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
  setReviewHydrationState?: (state: ReviewHydrationState) => void;
  isMounted?: () => boolean;
}): Promise<void> {
  const isMounted = input.isMounted ?? (() => true);
  const setSessionUnansweredReveal =
    input.setSessionUnansweredReveal ?? (() => undefined);
  const setReviewHydrationState =
    input.setReviewHydrationState ?? (() => undefined);
  setSessionUnansweredReveal(null);

  let res: ActionResult<GetPreviousAttemptOutput | null>;
  const normalizedReviewIds = normalizeReviewIdentifiers({
    mode: 'review',
    sessionId: input.sessionId,
    attemptId: input.attemptId,
  });

  try {
    res = await withTimeout(
      input.getPreviousAttemptFn({
        questionId: input.questionId,
        ...(normalizedReviewIds.attemptId
          ? { attemptId: normalizedReviewIds.attemptId }
          : {}),
        ...(normalizedReviewIds.sessionId
          ? { sessionId: normalizedReviewIds.sessionId }
          : {}),
      }),
      PREVIOUS_ATTEMPT_TIMEOUT_MS,
    );
  } catch {
    setReviewHydrationState('hydration_error');
    return;
  }
  if (!isMounted()) return;

  // Defensive guard: errors (!res.ok) and null results (!res.data, meaning
  // no previous attempt found) are differentiated for explicit fallback UX.
  if (!res || !res.ok) {
    setReviewHydrationState('hydration_error');
    return;
  }

  if (!res.data) {
    setReviewHydrationState('no_prior_attempt');
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
    setReviewHydrationState('session_unanswered');
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
  setReviewHydrationState('attempt');
}
