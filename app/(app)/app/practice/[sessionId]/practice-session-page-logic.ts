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
import type { EndPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export async function loadNextQuestion(input: {
  sessionId: string;
  questionId?: string;
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
      questionId: input.questionId,
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
      input.setSessionInfo(question?.session ?? null);
    },
    createRequestSequenceId: input.createRequestSequenceId,
    isLatestRequest: input.isLatestRequest,
    isMounted: input.isMounted,
  });
}

export function createLoadNextQuestionAction(input: {
  sessionId: string;
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
    isMounted: input.isMounted,
  });
}

export function maybeAutoAdvanceAfterSubmit(input: {
  mode: 'tutor' | 'exam' | null;
  submitResult: SubmitAnswerOutput | null;
  loadStateStatus: LoadState['status'];
  advance: () => void;
}): void {
  if (input.mode !== 'exam') return;
  if (input.loadStateStatus !== 'ready') return;
  if (!input.submitResult) return;
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
  setQuestion: (question: NextQuestion | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setSelectedChoiceId: (choiceId: string | null) => void;
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
  input.setQuestion(null);
  input.setSubmitResult(null);
  input.setSelectedChoiceId(null);
  input.setLoadState({ status: 'ready' });
}
