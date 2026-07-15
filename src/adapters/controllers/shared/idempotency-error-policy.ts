import {
  ApplicationConflictReasons,
  type ApplicationErrorCode,
  isApplicationError,
  isRollbackCertainPersistenceError,
  PracticeSessionConflictReasons,
} from '@/src/application/errors';

export const IdempotentActionNames = {
  Checkout: 'billing:createCheckoutSession',
  Portal: 'billing:createPortalSession',
  Bookmark: 'bookmark:setBookmark',
  QuestionRating: 'question-feedback:rateQuestion',
  QuestionReport: 'question-feedback:submitQuestionReport',
  SubmitAnswer: 'question:submitAnswer',
  QuestionMark: 'practice:setPracticeSessionQuestionMark',
  StartPracticeSession: 'practice:startPracticeSession',
} as const;

export type IdempotentActionName =
  (typeof IdempotentActionNames)[keyof typeof IdempotentActionNames];

export type IdempotencyErrorDisposition =
  | 'abort'
  | 'cache_determinate'
  | 'cache_indeterminate_fence';

type PublicActionError = {
  code: ApplicationErrorCode;
  details?: { reason?: string } | undefined;
};

export function isConcurrentRequestInProgressError(
  error: PublicActionError,
): boolean {
  return (
    error.code === 'CONFLICT' &&
    error.details?.reason ===
      ApplicationConflictReasons.ConcurrentRequestInProgress
  );
}

const determinateCodesByAction: Record<
  IdempotentActionName,
  ReadonlySet<ApplicationErrorCode>
> = {
  // Billing surfaces use mount-fixed keys with no client rotation, so any
  // cached outcome outlives the state it was derived from: ALREADY_SUBSCRIBED
  // depends on currentPeriodEnd > now and portal NOT_FOUND on a customer that
  // a later checkout can create. Nothing user-mutable is cacheable here.
  [IdempotentActionNames.Checkout]: new Set([]),
  [IdempotentActionNames.Portal]: new Set([]),
  [IdempotentActionNames.Bookmark]: new Set(['NOT_FOUND']),
  [IdempotentActionNames.QuestionRating]: new Set([
    'VALIDATION_ERROR',
    'NOT_FOUND',
  ]),
  [IdempotentActionNames.QuestionReport]: new Set([
    'VALIDATION_ERROR',
    'NOT_FOUND',
  ]),
  [IdempotentActionNames.SubmitAnswer]: new Set([
    'VALIDATION_ERROR',
    'NOT_FOUND',
  ]),
  [IdempotentActionNames.QuestionMark]: new Set([
    'VALIDATION_ERROR',
    'NOT_FOUND',
  ]),
  [IdempotentActionNames.StartPracticeSession]: new Set([
    'VALIDATION_ERROR',
    'NOT_FOUND',
  ]),
};

const terminalPracticeSessionReasons = new Set<string>([
  PracticeSessionConflictReasons.AlreadyEnded,
  PracticeSessionConflictReasons.ExamTimeExpired,
]);

function isDeterminateCachedError(
  action: IdempotentActionName,
  error: PublicActionError,
): boolean {
  if (determinateCodesByAction[action].has(error.code)) return true;

  if (
    (action === IdempotentActionNames.SubmitAnswer ||
      action === IdempotentActionNames.QuestionMark) &&
    error.code === 'CONFLICT'
  ) {
    const reason = error.details?.reason;
    return (
      typeof reason === 'string' && terminalPracticeSessionReasons.has(reason)
    );
  }

  if (
    action === IdempotentActionNames.StartPracticeSession &&
    error.code === 'CONFLICT'
  ) {
    return (
      error.details?.reason ===
      ApplicationConflictReasons.IncompleteSessionExists
    );
  }

  return false;
}

export function classifyIdempotencyExecutionError(
  action: IdempotentActionName,
  error: unknown,
): IdempotencyErrorDisposition {
  if (isRollbackCertainPersistenceError(error)) return 'abort';

  if (!isApplicationError(error)) {
    return action === IdempotentActionNames.SubmitAnswer
      ? 'cache_indeterminate_fence'
      : 'abort';
  }

  if (isDeterminateCachedError(action, error)) return 'cache_determinate';

  if (
    action === IdempotentActionNames.SubmitAnswer &&
    error.code === 'INTERNAL_ERROR'
  ) {
    // Unscoped attempts do not yet persist a request token. An INTERNAL_ERROR
    // can straddle COMMIT, so retain the claim outcome rather than risk a
    // duplicate attempt. Only owner-classified rollback-certain errors abort.
    return 'cache_indeterminate_fence';
  }

  return 'abort';
}

export function shouldRotateIdempotencyKeyAfterActionError(
  action: IdempotentActionName,
  error: PublicActionError,
): boolean {
  return isDeterminateCachedError(action, error);
}

export function rotateIdempotencyKeyAfterDeterminateError(
  action: IdempotentActionName,
  error: PublicActionError,
  rotateIdempotencyKey?: (() => void) | undefined,
): boolean {
  if (
    !rotateIdempotencyKey ||
    !shouldRotateIdempotencyKeyAfterActionError(action, error)
  ) {
    return false;
  }

  rotateIdempotencyKey();
  return true;
}

export function rotateGeneratedIdempotencyKeyAfterDeterminateError(
  action: IdempotentActionName,
  error: PublicActionError,
  input: {
    createIdempotencyKey?: (() => string) | undefined;
    setIdempotencyKey?: ((key: string) => void) | undefined;
  },
): boolean {
  const { createIdempotencyKey, setIdempotencyKey } = input;

  return rotateIdempotencyKeyAfterDeterminateError(
    action,
    error,
    createIdempotencyKey && setIdempotencyKey
      ? () => setIdempotencyKey(createIdempotencyKey())
      : undefined,
  );
}

function shouldCache(action: IdempotentActionName, error: unknown): boolean {
  return classifyIdempotencyExecutionError(action, error) !== 'abort';
}

export const shouldCacheCheckoutSessionError = (error: unknown): boolean =>
  shouldCache(IdempotentActionNames.Checkout, error);

export const shouldCachePortalSessionError = (error: unknown): boolean =>
  shouldCache(IdempotentActionNames.Portal, error);

export const shouldCacheBookmarkError = (error: unknown): boolean =>
  shouldCache(IdempotentActionNames.Bookmark, error);

export const shouldCacheQuestionRatingError = (error: unknown): boolean =>
  shouldCache(IdempotentActionNames.QuestionRating, error);

export const shouldCacheQuestionReportError = (error: unknown): boolean =>
  shouldCache(IdempotentActionNames.QuestionReport, error);

export const shouldCacheSubmitAnswerError = (error: unknown): boolean =>
  shouldCache(IdempotentActionNames.SubmitAnswer, error);

export const shouldCacheQuestionMarkError = (error: unknown): boolean =>
  shouldCache(IdempotentActionNames.QuestionMark, error);

export const shouldCacheStartPracticeSessionError = (error: unknown): boolean =>
  shouldCache(IdempotentActionNames.StartPracticeSession, error);
