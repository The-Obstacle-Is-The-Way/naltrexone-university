import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import {
  type EndedSessionConflictRecovery,
  type ExamDraftAnswer,
  isConcurrentRequestInProgressActionConflict,
  type NullQuestionRecovery,
  runLoadQuestionFlow,
  runSubmitAnswerFlow,
} from '@/app/(app)/app/practice/shared/question-flow-actions';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/shared/error-message-helpers';
import {
  STANDARD_MUTATION_TIMEOUT_MS,
  STANDARD_READ_TIMEOUT_MS,
} from '@/app/(app)/app/shared/timeout-tiers';
import { reportClientError } from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  FinalizeExamAnswersOutput,
  GetPracticeSessionReviewOutput,
  GetPracticeSessionSummaryOutput,
} from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

// WHY: This file exceeds the 300-line soft guideline intentionally.
// DEBT-234 enforces a warning threshold at 350 lines; DEBT-224 keeps 300 as the design guideline.
// It is a deep module (Ousterhout) with a single responsibility: orchestrate practice-session question lifecycle flows (load, submit, auto-advance, end session, and review loading effects).
// Splitting would separate tightly coupled async state-transition logic and increase race-condition risk between idempotency, timeout, and mounted-state guards.
// Reviewed in DEBT-224 audit (2026-02-18).
const END_SESSION_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS;
const SESSION_REVIEW_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;
const CONCURRENT_REQUEST_SUMMARY_RECOVERY_ATTEMPTS = 2;
const CONCURRENT_REQUEST_SUMMARY_RETRY_DELAY_MS = 100;
const CONCURRENT_REQUEST_STILL_PROCESSING_MESSAGE =
  'Your previous request is still processing. Please try again shortly.';
type SessionIdInput = { sessionId: string };
type LoadNextQuestionOptions = {
  recoverNullQuestion?: NullQuestionRecovery | undefined;
};
type EndPracticeSessionActionInput = SessionIdInput & {
  idempotencyKey?: string;
  finalDraftAnswer?: ExamDraftAnswer;
};
type PracticeSessionFinalizationOutput =
  | EndPracticeSessionOutput
  | FinalizeExamAnswersOutput
  | GetPracticeSessionSummaryOutput;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadNextQuestion(input: {
  sessionId: string;
  questionId?: string | undefined;
  fromIndex?: number | undefined;
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  createIdempotencyKey: () => string;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setSubmitIdempotencyKey: (key: string | null) => void;
  setQuestionLoadedAt: (loadedAtMs: number | null) => void;
  setQuestion: (question: NextQuestion | null) => void;
  setSessionInfo: (info: NextQuestion['session']) => void;
  recoverNullQuestion?: NullQuestionRecovery | undefined;
  recoverEndedSessionConflict?: EndedSessionConflictRecovery | undefined;
  createRequestSequenceId?: (() => number) | undefined;
  isLatestRequest?: ((requestId: number) => boolean) | undefined;
  isMounted?: (() => boolean) | undefined;
}): Promise<void> {
  return runLoadQuestionFlow({
    requestInput: {
      sessionId: input.sessionId,
      ...(typeof input.questionId === 'string'
        ? { questionId: input.questionId }
        : {}),
      ...(typeof input.fromIndex === 'number'
        ? { fromIndex: input.fromIndex }
        : {}),
    },
    getQuestionFn: input.getNextQuestionFn,
    createIdempotencyKey: input.createIdempotencyKey,
    nowMs: input.nowMs,
    setLoadState: input.setLoadState,
    setSelectedChoiceId: input.setSelectedChoiceId,
    setSubmitResult: input.setSubmitResult,
    setSubmitIdempotencyKey: input.setSubmitIdempotencyKey,
    setQuestionLoadedAt: input.setQuestionLoadedAt,
    setQuestion: input.setQuestion,
    onLoaded: (question) => {
      if (!question?.session) return;
      input.setSessionInfo(question.session);
    },
    recoverNullQuestion: input.recoverNullQuestion,
    recoverEndedSessionConflict: input.recoverEndedSessionConflict,
    createRequestSequenceId: input.createRequestSequenceId,
    isLatestRequest: input.isLatestRequest,
    isMounted: input.isMounted,
  });
}

export function createLoadNextQuestionAction(input: {
  sessionId: string;
  fromIndex?: number | undefined;
  startTransition: (fn: () => void) => void;
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  createIdempotencyKey: () => string;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setSubmitIdempotencyKey: (key: string | null) => void;
  setQuestionLoadedAt: (loadedAtMs: number | null) => void;
  setQuestion: (question: NextQuestion | null) => void;
  setSessionInfo: (info: NextQuestion['session']) => void;
  recoverEndedSessionConflict?: EndedSessionConflictRecovery | undefined;
  createRequestSequenceId?: (() => number) | undefined;
  isLatestRequest?: ((requestId: number) => boolean) | undefined;
  isMounted?: (() => boolean) | undefined;
}): (options?: LoadNextQuestionOptions) => void {
  return (options) => {
    input.startTransition(() => {
      void loadNextQuestion({
        ...input,
        recoverNullQuestion: options?.recoverNullQuestion,
      });
    });
  };
}

export async function submitAnswerForQuestion(input: {
  sessionId: string;
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  questionLoadedAtMs: number | null;
  submitIdempotencyKey: string | null;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  onSuccess?: ((result: SubmitAnswerOutput) => void) | undefined;
  rotateIdempotencyKey?: (() => void) | undefined;
  recoverEndedSessionConflict?: EndedSessionConflictRecovery | undefined;
  createRequestSequenceId?: (() => number) | undefined;
  isLatestRequest?: ((requestId: number) => boolean) | undefined;
  isMounted?: (() => boolean) | undefined;
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
      sessionId: input.sessionId,
      idempotencyKey: idempotencyKey ?? undefined,
      timeSpentSeconds,
    }),
    nowMs: input.nowMs,
    setLoadState: input.setLoadState,
    setSubmitResult: input.setSubmitResult,
    onSuccess: input.onSuccess,
    rotateIdempotencyKey: input.rotateIdempotencyKey,
    recoverEndedSessionConflict: input.recoverEndedSessionConflict,
    createRequestSequenceId: input.createRequestSequenceId,
    isLatestRequest: input.isLatestRequest,
    isMounted: input.isMounted,
  });
}

export async function endSession(input: {
  sessionId: string;
  endSessionIdempotencyKey: string;
  finalDraftAnswer?: ExamDraftAnswer | undefined;
  finalizeSessionFn: (
    input: EndPracticeSessionActionInput,
  ) => Promise<ActionResult<PracticeSessionFinalizationOutput>>;
  getPracticeSessionSummaryFn: (
    input: SessionIdInput,
  ) => Promise<ActionResult<GetPracticeSessionSummaryOutput>>;
  setLoadState: (state: LoadState) => void;
  setSummary: (summary: PracticeSessionFinalizationOutput | null) => void;
  resetQuestionState: () => void;
  rotateIdempotencyKey?: (() => void) | undefined;
  isMounted?: (() => boolean) | undefined;
}): Promise<boolean> {
  const isMounted = input.isMounted ?? (() => true);

  input.setLoadState({ status: 'loading' });

  let res: ActionResult<PracticeSessionFinalizationOutput>;
  try {
    res = await withTimeout(
      input.finalizeSessionFn({
        sessionId: input.sessionId,
        idempotencyKey: input.endSessionIdempotencyKey,
        ...(input.finalDraftAnswer
          ? { finalDraftAnswer: input.finalDraftAnswer }
          : {}),
      }),
      END_SESSION_TIMEOUT_MS,
    );
  } catch (error) {
    if (!isMounted()) return false;

    reportClientError(error, {
      component: 'PracticeSessionPageLogic',
      action: 'endSession',
    });
    input.rotateIdempotencyKey?.();
    input.setLoadState({
      status: 'error',
      message: getThrownErrorMessage(error),
    });
    return false;
  }
  if (!isMounted()) return false;
  if (!res.ok) {
    let recoveryErrorMessage: string | null = null;
    const isConcurrentRequestInProgress =
      isConcurrentRequestInProgressActionConflict(res);

    if (res.error.code === 'CONFLICT') {
      const recoveryAttempts = isConcurrentRequestInProgress
        ? CONCURRENT_REQUEST_SUMMARY_RECOVERY_ATTEMPTS
        : 1;

      for (let attempt = 0; attempt < recoveryAttempts; attempt += 1) {
        if (attempt > 0) {
          await delay(CONCURRENT_REQUEST_SUMMARY_RETRY_DELAY_MS);
          if (!isMounted()) return false;
        }

        try {
          const summaryRes = await withTimeout(
            input.getPracticeSessionSummaryFn({
              sessionId: input.sessionId,
            }),
            END_SESSION_TIMEOUT_MS,
          );
          if (!isMounted()) return false;
          if (summaryRes.ok) {
            input.setSummary(summaryRes.data);
            input.resetQuestionState();
            input.setLoadState({ status: 'ready' });
            return true;
          }

          recoveryErrorMessage = getActionResultErrorMessage(summaryRes);
        } catch (error) {
          if (!isMounted()) return false;
          reportClientError(error, {
            component: 'PracticeSessionPageLogic',
            action: 'getPracticeSessionSummary',
          });
          recoveryErrorMessage = getThrownErrorMessage(error);
        }
      }
    }

    if (isConcurrentRequestInProgress) {
      input.setLoadState({
        status: 'error',
        message: CONCURRENT_REQUEST_STILL_PROCESSING_MESSAGE,
      });
      return false;
    }

    input.rotateIdempotencyKey?.();
    input.setLoadState({
      status: 'error',
      message: recoveryErrorMessage ?? getActionResultErrorMessage(res),
    });
    return false;
  }

  input.setSummary(res.data);
  input.resetQuestionState();
  input.setLoadState({ status: 'ready' });
  return true;
}

export function createNavigatorEffect(input: {
  summary: EndPracticeSessionOutput | null;
  isInReviewStage: boolean;
  sessionInfo: NextQuestion['session'];
  sessionId: string;
  getPracticeSessionReviewFn: (
    input: SessionIdInput,
  ) => Promise<ActionResult<GetPracticeSessionReviewOutput>>;
  setNavigator: (navigator: GetPracticeSessionReviewOutput | null) => void;
  setNavigatorLoadState: (state: LoadState) => void;
  isMounted?: () => boolean;
}): () => void {
  const isMounted = input.isMounted ?? (() => true);

  if (input.summary || input.isInReviewStage || !input.sessionInfo) {
    input.setNavigator(null);
    input.setNavigatorLoadState({ status: 'idle' });
    return () => {};
  }

  let mounted = true;
  input.setNavigatorLoadState({ status: 'loading' });

  void (async () => {
    let res: Awaited<ReturnType<typeof input.getPracticeSessionReviewFn>>;
    try {
      res = await withTimeout(
        input.getPracticeSessionReviewFn({
          sessionId: input.sessionId,
        }),
        SESSION_REVIEW_TIMEOUT_MS,
      );
    } catch (error) {
      if (!mounted || !isMounted()) return;
      reportClientError(error, {
        component: 'PracticeSessionPageLogic',
        action: 'loadNavigator',
      });
      input.setNavigator(null);
      input.setNavigatorLoadState({
        status: 'error',
        message: getThrownErrorMessage(error),
      });
      return;
    }
    if (!mounted || !isMounted()) return;
    if (!res.ok) {
      input.setNavigator(null);
      input.setNavigatorLoadState({
        status: 'error',
        message: getActionResultErrorMessage(res),
      });
      return;
    }

    input.setNavigator(res.data);
    input.setNavigatorLoadState({ status: 'ready' });
  })();

  return () => {
    mounted = false;
  };
}

export function createSummaryReviewEffect(input: {
  summary: EndPracticeSessionOutput | null;
  sessionId: string;
  getPracticeSessionReviewFn: (
    input: SessionIdInput,
  ) => Promise<ActionResult<GetPracticeSessionReviewOutput>>;
  setSummaryReview: (review: GetPracticeSessionReviewOutput | null) => void;
  setSummaryReviewLoadState: (state: LoadState) => void;
  isMounted?: () => boolean;
}): () => void {
  const isMounted = input.isMounted ?? (() => true);

  if (!input.summary) {
    input.setSummaryReview(null);
    input.setSummaryReviewLoadState({ status: 'idle' });
    return () => {};
  }

  let mounted = true;
  input.setSummaryReview(null);
  input.setSummaryReviewLoadState({ status: 'loading' });

  void (async () => {
    let res: Awaited<ReturnType<typeof input.getPracticeSessionReviewFn>>;
    try {
      res = await withTimeout(
        input.getPracticeSessionReviewFn({
          sessionId: input.sessionId,
        }),
        SESSION_REVIEW_TIMEOUT_MS,
      );
    } catch (error) {
      if (!mounted || !isMounted()) return;
      reportClientError(error, {
        component: 'PracticeSessionPageLogic',
        action: 'loadSummaryReview',
      });
      input.setSummaryReviewLoadState({
        status: 'error',
        message: getThrownErrorMessage(error),
      });
      return;
    }
    if (!mounted || !isMounted()) return;
    if (!res.ok) {
      input.setSummaryReviewLoadState({
        status: 'error',
        message: getActionResultErrorMessage(res),
      });
      return;
    }

    input.setSummaryReview(res.data);
    input.setSummaryReviewLoadState({ status: 'ready' });
  })();

  return () => {
    mounted = false;
  };
}
