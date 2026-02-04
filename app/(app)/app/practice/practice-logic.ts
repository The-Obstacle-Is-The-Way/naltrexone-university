import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export function getActionResultErrorMessage(
  result: ActionResult<unknown>,
): string {
  if (result.ok) return 'Unexpected ok result';
  return result.error.message;
}

export function getThrownErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return 'Unexpected error';
}

export async function loadNextQuestion(input: {
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
}): Promise<
  { ok: true; question: NextQuestion | null } | { ok: false; message: string }
> {
  const res = await input.getNextQuestionFn({
    filters: { tagSlugs: [], difficulties: [] },
  });

  if (!res.ok) {
    return { ok: false, message: getActionResultErrorMessage(res) };
  }

  return { ok: true, question: res.data };
}

export async function loadBookmarkedQuestionIds(input: {
  getBookmarksFn: (input: unknown) => Promise<
    ActionResult<{
      rows: Array<{ questionId: string }>;
    }>
  >;
}): Promise<
  { ok: true; questionIds: Set<string> } | { ok: false; message: string }
> {
  const res = await input.getBookmarksFn({});
  if (!res.ok) {
    return { ok: false, message: getActionResultErrorMessage(res) };
  }

  const questionIds = new Set(res.data.rows.map((row) => row.questionId));
  return { ok: true, questionIds };
}

export async function submitSelectedAnswer(input: {
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
  questionId: string;
  choiceId: string;
}): Promise<
  { ok: true; data: SubmitAnswerOutput } | { ok: false; message: string }
> {
  const res = await input.submitAnswerFn({
    questionId: input.questionId,
    choiceId: input.choiceId,
  });

  if (!res.ok) {
    return { ok: false, message: getActionResultErrorMessage(res) };
  }

  return { ok: true, data: res.data };
}

export async function toggleQuestionBookmark(input: {
  toggleBookmarkFn: (
    input: unknown,
  ) => Promise<ActionResult<{ bookmarked: boolean }>>;
  questionId: string;
}): Promise<
  { ok: true; bookmarked: boolean } | { ok: false; message: string }
> {
  const res = await input.toggleBookmarkFn({ questionId: input.questionId });
  if (!res.ok) {
    return { ok: false, message: getActionResultErrorMessage(res) };
  }
  return { ok: true, bookmarked: res.data.bookmarked };
}

export function applyBookmarkUpdate(input: {
  prev: Set<string>;
  questionId: string;
  bookmarked: boolean;
}): Set<string> {
  const next = new Set(input.prev);
  if (input.bookmarked) next.add(input.questionId);
  else next.delete(input.questionId);
  return next;
}
