import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/shared/error-message-helpers';
import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import {
  STANDARD_MUTATION_TIMEOUT_MS,
  STANDARD_READ_TIMEOUT_MS,
} from '@/app/(app)/app/shared/timeout-tiers';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SaveExamDraftAnswerOutput } from '@/src/adapters/controllers/practice-controller';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { MS_PER_SECOND } from '@/src/domain/services';

const LOAD_QUESTION_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;
const SAVE_DRAFT_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS;
const SUBMIT_ANSWER_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS;

export type RequestSequencingHooks = {
  createRequestSequenceId: () => number;
  isLatestRequest: (requestId: number) => boolean;
};

export type NullQuestionRecovery = () => Promise<boolean>;

function assertRequestSequencingHooks(input: {
  createRequestSequenceId?:
    | RequestSequencingHooks['createRequestSequenceId']
    | undefined;
  isLatestRequest?: RequestSequencingHooks['isLatestRequest'] | undefined;
}): void {
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

  return Math.max(0, Math.floor((nowMs - questionLoadedAtMs) / MS_PER_SECOND));
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
  onLoaded?: ((question: TQuestion | null) => void) | undefined;
  recoverNullQuestion?: NullQuestionRecovery | undefined;
  createRequestSequenceId?: (() => number) | undefined;
  isLatestRequest?: ((requestId: number) => boolean) | undefined;
  isMounted?: (() => boolean) | undefined;
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

  if (res.data === null && input.recoverNullQuestion) {
    const handled = await input.recoverNullQuestion();
    if (!canCommit()) return;
    if (handled) return;
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

export async function maybeSaveDraftBeforeNavigation<
  TQuestion extends {
    questionId: string;
    session?: {
      mode?: 'tutor' | 'exam';
    } | null;
  },
>(input: {
  sessionId: string;
  question: TQuestion | null;
  selectedChoiceId: string | null;
  currentCumulativeMs: number;
  lastSavedDraftSelectedChoiceId: string | null;
  lastSavedDraftCumulativeMs: number;
  saveExamDraftAnswerFn: (
    input: unknown,
  ) => Promise<ActionResult<SaveExamDraftAnswerOutput>>;
  setLoadState: (state: AsyncLoadStateWithIdle) => void;
  onSaved?: (draft: {
    questionId: string;
    selectedChoiceId: string | null;
    cumulativeMs: number;
  }) => void;
}): Promise<boolean> {
  if (!input.question) return true;
  if (input.question.session?.mode !== 'exam') return true;

  const hasDraftChanged =
    input.selectedChoiceId !== input.lastSavedDraftSelectedChoiceId;
  const hasCumulativeTimeAdvanced =
    input.currentCumulativeMs > input.lastSavedDraftCumulativeMs;

  if (!hasDraftChanged && !hasCumulativeTimeAdvanced) {
    return true;
  }

  let res: ActionResult<SaveExamDraftAnswerOutput>;
  try {
    res = await withTimeout(
      input.saveExamDraftAnswerFn({
        sessionId: input.sessionId,
        questionId: input.question.questionId,
        selectedChoiceId: input.selectedChoiceId,
        cumulativeMs: input.currentCumulativeMs,
      }),
      SAVE_DRAFT_TIMEOUT_MS,
    );
  } catch (error) {
    input.setLoadState({
      status: 'error',
      message: getThrownErrorMessage(error),
    });
    return false;
  }

  if (!res.ok) {
    input.setLoadState({
      status: 'error',
      message: getActionResultErrorMessage(res),
    });
    return false;
  }

  input.onSaved?.({
    questionId: input.question.questionId,
    selectedChoiceId: res.data.draftSelectedChoiceId,
    cumulativeMs: res.data.draftCumulativeMs,
  });
  return true;
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
  onSuccess?: ((result: SubmitAnswerOutput) => void) | undefined;
  createRequestSequenceId?: (() => number) | undefined;
  isLatestRequest?: ((requestId: number) => boolean) | undefined;
  isMounted?: (() => boolean) | undefined;
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
