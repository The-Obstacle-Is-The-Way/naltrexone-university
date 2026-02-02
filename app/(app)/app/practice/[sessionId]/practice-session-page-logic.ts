import { getActionResultErrorMessage } from '@/app/(app)/app/practice/practice-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { EndPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export async function loadNextQuestion(input: {
  sessionId: string;
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setQuestionLoadedAt: (loadedAtMs: number | null) => void;
  setQuestion: (question: NextQuestion | null) => void;
  setSessionInfo: (info: NextQuestion['session']) => void;
}): Promise<void> {
  input.setLoadState({ status: 'loading' });
  input.setSelectedChoiceId(null);
  input.setSubmitResult(null);
  input.setQuestionLoadedAt(null);

  const res = await input.getNextQuestionFn({ sessionId: input.sessionId });

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
  if (res.data?.session) {
    input.setSessionInfo(res.data.session);
  }
  input.setLoadState({ status: 'ready' });
}

export function createLoadNextQuestionAction(input: {
  sessionId: string;
  startTransition: (fn: () => void) => void;
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setQuestionLoadedAt: (loadedAtMs: number | null) => void;
  setQuestion: (question: NextQuestion | null) => void;
  setSessionInfo: (info: NextQuestion['session']) => void;
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
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
  nowMs: () => number;
  setLoadState: (state: LoadState) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
}): Promise<void> {
  if (!input.question) return;
  if (!input.selectedChoiceId) return;

  input.setLoadState({ status: 'loading' });

  const timeSpentSeconds = input.questionLoadedAtMs
    ? Math.floor((input.nowMs() - input.questionLoadedAtMs) / 1000)
    : 0;

  const res = await input.submitAnswerFn({
    questionId: input.question.questionId,
    choiceId: input.selectedChoiceId,
    sessionId: input.sessionId,
    timeSpentSeconds,
  });

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

export async function endSession(input: {
  sessionId: string;
  endPracticeSessionFn: (
    input: unknown,
  ) => Promise<ActionResult<EndPracticeSessionOutput>>;
  setLoadState: (state: LoadState) => void;
  setSummary: (summary: EndPracticeSessionOutput | null) => void;
  setQuestion: (question: NextQuestion | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setSelectedChoiceId: (choiceId: string | null) => void;
}): Promise<void> {
  input.setLoadState({ status: 'loading' });

  const res = await input.endPracticeSessionFn({ sessionId: input.sessionId });
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
