import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/shared/error-message-helpers';
import type { AsyncLoadState } from '@/app/(app)/app/shared/load-state';
import {
  STANDARD_MUTATION_TIMEOUT_MS,
  STANDARD_READ_TIMEOUT_MS,
} from '@/app/(app)/app/shared/timeout-tiers';
import { runTransitionedAsyncAction } from '@/app/(app)/app/shared/transitioned-async-action';
import { reportClientError } from '@/lib/report-client-error';
import type { QuestionMode, QuestionOrigin } from '@/lib/routes';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import type { GetPreviousAttemptOutput } from '@/src/application/use-cases/get-previous-attempt';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import type { AttemptRetryOrigin } from '@/src/domain/entities';
import { MS_PER_SECOND } from '@/src/domain/services';

const QUESTION_LOAD_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;
const ANSWER_SUBMIT_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS;
const PREVIOUS_ATTEMPT_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;

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
  sessionMode: 'tutor' | 'exam' | null;
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
  isStale?: () => boolean;
}): Promise<void> {
  const isMounted = input.isMounted ?? (() => true);
  const isStale = input.isStale ?? (() => false);

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
    if (!isMounted() || isStale()) return;

    reportClientError(error, {
      component: 'QuestionPageLogic',
      action: 'loadQuestion',
    });
    input.setLoadState({
      status: 'error',
      message: getThrownErrorMessage(error),
    });
    input.setQuestion(null);
    return;
  }
  if (!isMounted() || isStale()) return;

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
  isStale?: () => boolean;
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
  onSuccess?: (result: SubmitAnswerOutput) => void;
  isMounted?: () => boolean;
  isStale?: () => boolean;
}): Promise<void> {
  if (!input.question) return;
  if (!input.selectedChoiceId) return;

  const isMounted = input.isMounted ?? (() => true);
  const isStale = input.isStale ?? (() => false);

  input.setLoadState({ status: 'loading' });

  const timeSpentSeconds =
    input.questionLoadedAtMs === null
      ? 0
      : Math.max(
          0,
          Math.floor(
            (input.nowMs() - input.questionLoadedAtMs) / MS_PER_SECOND,
          ),
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
    if (!isMounted() || isStale()) return;

    reportClientError(error, {
      component: 'QuestionPageLogic',
      action: 'submitSelectedAnswer',
    });
    input.setLoadState({
      status: 'error',
      message: getThrownErrorMessage(error),
    });
    return;
  }
  if (!isMounted() || isStale()) return;

  if (!res.ok) {
    input.setLoadState({
      status: 'error',
      message: getActionResultErrorMessage(res),
    });
    return;
  }

  input.setSubmitResult(res.data);
  input.onSuccess?.(res.data);
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
  onSuccess?: (result: SubmitAnswerOutput) => void;
  onUnhandledError?: (error: unknown) => void;
  isMounted?: () => boolean;
  isStale?: () => boolean;
}): () => Promise<void> {
  return () =>
    runTransitionedAsyncAction({
      startTransition: input.startTransition,
      run: () => submitSelectedAnswer(input),
      onUnhandledError: input.onUnhandledError,
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
  setReviewSessionMode?: (mode: 'tutor' | 'exam' | null) => void;
  setSessionUnansweredReveal?: (reveal: SessionUnansweredReveal | null) => void;
  setReviewHydrationState?: (state: ReviewHydrationState) => void;
  isMounted?: () => boolean;
  isStale?: () => boolean;
}): Promise<void> {
  const isMounted = input.isMounted ?? (() => true);
  const isStale = input.isStale ?? (() => false);
  const setSessionUnansweredReveal =
    input.setSessionUnansweredReveal ?? (() => undefined);
  const setReviewSessionMode = input.setReviewSessionMode ?? (() => undefined);
  const setReviewHydrationState =
    input.setReviewHydrationState ?? (() => undefined);
  setSessionUnansweredReveal(null);
  setReviewSessionMode(null);

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
  } catch (error) {
    if (!isMounted() || isStale()) return;
    reportClientError(error, {
      component: 'QuestionPageLogic',
      action: 'loadPreviousAttempt',
    });
    setReviewHydrationState('hydration_error');
    return;
  }
  if (!isMounted() || isStale()) return;

  // Defensive guard: errors (!res.ok) and null results (!res.data, meaning
  // no previous attempt found) are differentiated for explicit fallback UX.
  if (!res || !res.ok) {
    setReviewHydrationState('hydration_error');
    return;
  }

  if (!res.data) {
    setReviewSessionMode(null);
    setReviewHydrationState('no_prior_attempt');
    return;
  }

  const data = res.data;
  if (data.kind === 'session_unanswered') {
    input.setSelectedChoiceId(null);
    input.setSubmitResult(null);
    setReviewSessionMode(data.sessionMode);
    setSessionUnansweredReveal({
      sessionMode: data.sessionMode,
      correctChoiceId: data.correctChoiceId,
      explanationMd: data.explanationMd,
      referenceMd: data.referenceMd ?? null,
      choiceExplanations: data.choiceExplanations,
    });
    setReviewHydrationState('session_unanswered');
    return;
  }

  setSessionUnansweredReveal(null);
  setReviewSessionMode(data.sessionMode);
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
