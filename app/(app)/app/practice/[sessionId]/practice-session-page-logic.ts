import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
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
      sessionId: input.sessionId,
      questionId: input.questionId,
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
    input.setSubmitIdempotencyKey(null);
    return;
  }

  input.setQuestion(res.data);
  input.setQuestionLoadedAt(res.data ? input.nowMs() : null);
  input.setSubmitIdempotencyKey(res.data ? input.createIdempotencyKey() : null);
  input.setSessionInfo(res.data?.session ?? null);
  input.setLoadState({ status: 'ready' });
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
  return () => {
    input.startTransition(() => {
      void loadNextQuestion(input);
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
      sessionId: input.sessionId,
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

  input.setSummary(res.data);
  input.setQuestion(null);
  input.setSubmitResult(null);
  input.setSelectedChoiceId(null);
  input.setLoadState({ status: 'ready' });
}
