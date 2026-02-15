import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import {
  createTransitionedLoadAction,
  runLoadQuestionFlow,
  runSubmitAnswerFlow,
} from '@/app/(app)/app/practice/shared/question-flow-actions';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  GetPracticeSessionReviewOutput,
} from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export async function loadNextQuestion(input: {
  sessionId: string;
  questionId?: string;
  fromIndex?: number;
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
  createRequestSequenceId?: () => number;
  isLatestRequest?: (requestId: number) => boolean;
  isMounted?: () => boolean;
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
    createRequestSequenceId: input.createRequestSequenceId,
    isLatestRequest: input.isLatestRequest,
    isMounted: input.isMounted,
  });
}

export function createLoadNextQuestionAction(input: {
  sessionId: string;
  fromIndex?: number;
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
  sessionId: string;
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  questionLoadedAtMs: number | null;
  submitIdempotencyKey: string | null;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  onSuccess?: (result: SubmitAnswerOutput) => void;
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
      sessionId: input.sessionId,
      idempotencyKey: idempotencyKey ?? undefined,
      timeSpentSeconds,
    }),
    nowMs: input.nowMs,
    setLoadState: input.setLoadState,
    setSubmitResult: input.setSubmitResult,
    onSuccess: input.onSuccess,
    isMounted: input.isMounted,
  });
}

export function maybeAutoAdvanceAfterSubmit(input: {
  mode: 'tutor' | 'exam' | null;
  submitResult: SubmitAnswerOutput | null;
  loadStateStatus: LoadState['status'];
  sessionInfo: NextQuestion['session'];
  advance: () => void;
}): void {
  if (input.mode !== 'exam') return;
  if (input.loadStateStatus !== 'ready') return;
  if (!input.submitResult) return;
  const isLastQuestion =
    input.sessionInfo !== null &&
    typeof input.sessionInfo.index === 'number' &&
    typeof input.sessionInfo.total === 'number' &&
    input.sessionInfo.index >= input.sessionInfo.total - 1;
  if (isLastQuestion) return;
  input.advance();
}

export async function endSession(input: {
  sessionId: string;
  endSessionIdempotencyKey: string;
  endPracticeSessionFn: (
    input: unknown,
  ) => Promise<ActionResult<EndPracticeSessionOutput>>;
  setLoadState: (state: LoadState) => void;
  setSummary: (summary: EndPracticeSessionOutput | null) => void;
  resetQuestionState: () => void;
  rotateIdempotencyKey?: () => void;
  isMounted?: () => boolean;
}): Promise<void> {
  const isMounted = input.isMounted ?? (() => true);

  input.setLoadState({ status: 'loading' });

  let res: ActionResult<EndPracticeSessionOutput>;
  try {
    res = await input.endPracticeSessionFn({
      sessionId: input.sessionId,
      idempotencyKey: input.endSessionIdempotencyKey,
    });
  } catch (error) {
    if (!isMounted()) return;

    input.rotateIdempotencyKey?.();
    input.setLoadState({
      status: 'error',
      message: getThrownErrorMessage(error),
    });
    return;
  }
  if (!isMounted()) return;
  if (!res.ok) {
    input.rotateIdempotencyKey?.();
    input.setLoadState({
      status: 'error',
      message: getActionResultErrorMessage(res),
    });
    return;
  }

  input.setSummary(res.data);
  input.resetQuestionState();
  input.setLoadState({ status: 'ready' });
}

export function createNavigatorEffect(input: {
  summary: EndPracticeSessionOutput | null;
  isInReviewStage: boolean;
  sessionInfo: NextQuestion['session'];
  sessionId: string;
  getPracticeSessionReviewFn: (
    input: unknown,
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
      res = await input.getPracticeSessionReviewFn({
        sessionId: input.sessionId,
      });
    } catch (error) {
      if (!mounted || !isMounted()) return;
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
    input: unknown,
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
      res = await input.getPracticeSessionReviewFn({
        sessionId: input.sessionId,
      });
    } catch (error) {
      if (!mounted || !isMounted()) return;
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
