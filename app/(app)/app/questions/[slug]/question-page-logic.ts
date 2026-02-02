import { getActionResultErrorMessage } from '@/app/(app)/app/practice/practice-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

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
}): Promise<void> {
  input.setLoadState({ status: 'loading' });
  input.setSelectedChoiceId(null);
  input.setSubmitResult(null);
  input.setSubmitIdempotencyKey(null);
  input.setQuestionLoadedAt(null);

  const res = await input.getQuestionBySlugFn({ slug: input.slug });
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
    idempotencyKey: input.submitIdempotencyKey ?? undefined,
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
