import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

const LOAD_QUESTION_TIMEOUT_MS = 15_000;
const SUBMIT_ANSWER_TIMEOUT_MS = 15_000;

export type RequestSequencingHooks = {
  createRequestSequenceId: () => number;
  isLatestRequest: (requestId: number) => boolean;
};

function assertRequestSequencingHooks(
  input: Pick<
    Partial<RequestSequencingHooks>,
    'createRequestSequenceId' | 'isLatestRequest'
  >,
): void {
  const hasCreateRequestSequenceId =
    typeof input.createRequestSequenceId === 'function';
  const hasIsLatestRequest = typeof input.isLatestRequest === 'function';

  if (hasCreateRequestSequenceId === hasIsLatestRequest) return;

  throw new Error('Request sequencing hooks must be provided together');
}

export function buildTimeSpentSeconds(
  questionLoadedAtMs: number | null,
  nowMs: number,
): number {
  if (questionLoadedAtMs === null) return 0;

  return Math.max(0, Math.floor((nowMs - questionLoadedAtMs) / 1000));
}

export async function runLoadQuestionFlow<TQuestion>(input: {
  requestInput: unknown;
  getQuestionFn: (input: unknown) => Promise<ActionResult<TQuestion | null>>;
  createIdempotencyKey: () => string;
  nowMs: () => number;
  setLoadState: (state: AsyncLoadStateWithIdle) => void;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (
    result: SubmitAnswerOutput | null,
    questionId?: string | null,
  ) => void;
  setSubmitIdempotencyKey: (key: string | null) => void;
  setQuestionLoadedAt: (loadedAtMs: number | null) => void;
  setQuestion: (question: TQuestion | null) => void;
  onLoaded?: (question: TQuestion | null) => void;
  createRequestSequenceId?: () => number;
  isLatestRequest?: (requestId: number) => boolean;
  isMounted?: () => boolean;
}): Promise<void> {
  assertRequestSequencingHooks(input);
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

  let res: ActionResult<TQuestion | null>;
  try {
    res = await withTimeout(
      input.getQuestionFn(input.requestInput),
      LOAD_QUESTION_TIMEOUT_MS,
    );
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
    input.onLoaded?.(null);
    return;
  }
  if (!canCommit()) return;

  if (!res.ok) {
    input.setLoadState({
      status: 'error',
      message: getActionResultErrorMessage(res),
    });
    input.setQuestion(null);
    input.setSelectedChoiceId(null);
    input.setSubmitResult(null);
    input.setSubmitIdempotencyKey(null);
    input.setQuestionLoadedAt(null);
    input.onLoaded?.(null);
    return;
  }

  input.setQuestion(res.data);
  input.setQuestionLoadedAt(res.data ? input.nowMs() : null);
  input.setSubmitIdempotencyKey(res.data ? input.createIdempotencyKey() : null);
  input.onLoaded?.(res.data);
  input.setLoadState({ status: 'ready' });
}

export function createTransitionedLoadAction(input: {
  startTransition: (fn: () => void) => void;
  run: () => Promise<void>;
}): () => void {
  return () => {
    input.startTransition(() => {
      void input.run();
    });
  };
}

export function runTransitionedAsyncAction(input: {
  startTransition: (fn: () => void) => void;
  run: () => Promise<void>;
  onUnhandledError?: (error: unknown) => void;
}): Promise<void> {
  return new Promise((resolve) => {
    input.startTransition(async () => {
      try {
        await input.run();
      } catch (error) {
        // The caller owns error state; this prevents unhandled rejections.
        try {
          input.onUnhandledError?.(error);
        } catch {
          // Reporter failures must not mask the original error.
        }
        console.error(
          'runTransitionedAsyncAction: unhandled error in run()',
          error,
        );
      } finally {
        resolve();
      }
    });
  });
}

export async function runSubmitAnswerFlow<
  TQuestion extends { questionId: string },
>(input: {
  question: TQuestion | null;
  selectedChoiceId: string | null;
  questionLoadedAtMs: number | null;
  submitIdempotencyKey: string | null;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
  buildSubmitInput: (input: {
    question: TQuestion;
    selectedChoiceId: string;
    idempotencyKey: string | null;
    timeSpentSeconds: number;
  }) => unknown;
  nowMs: () => number;
  setLoadState: (state: AsyncLoadStateWithIdle) => void;
  setSubmitResult: (
    result: SubmitAnswerOutput | null,
    questionId?: string | null,
  ) => void;
  onSuccess?: (result: SubmitAnswerOutput) => void;
  createRequestSequenceId?: () => number;
  isLatestRequest?: (requestId: number) => boolean;
  isMounted?: () => boolean;
}): Promise<void> {
  assertRequestSequencingHooks(input);
  if (!input.question) return;
  if (!input.selectedChoiceId) return;

  const isMounted = input.isMounted ?? (() => true);
  const requestId = input.createRequestSequenceId?.();
  const canCommit = () => {
    if (!isMounted()) return false;
    if (requestId === undefined) return true;
    return input.isLatestRequest?.(requestId) ?? true;
  };

  const timeSpentSeconds = buildTimeSpentSeconds(
    input.questionLoadedAtMs,
    input.nowMs(),
  );

  let res: ActionResult<SubmitAnswerOutput>;
  try {
    res = await withTimeout(
      input.submitAnswerFn(
        input.buildSubmitInput({
          question: input.question,
          selectedChoiceId: input.selectedChoiceId,
          idempotencyKey: input.submitIdempotencyKey,
          timeSpentSeconds,
        }),
      ),
      SUBMIT_ANSWER_TIMEOUT_MS,
    );
  } catch (error) {
    if (!canCommit()) return;

    input.setLoadState({
      status: 'error',
      message: getThrownErrorMessage(error),
    });
    return;
  }
  if (!canCommit()) return;

  if (!res.ok) {
    input.setLoadState({
      status: 'error',
      message: getActionResultErrorMessage(res),
    });
    return;
  }

  input.setSubmitResult(res.data, input.question.questionId);
  input.onSuccess?.(res.data);
  input.setLoadState({ status: 'ready' });
}
