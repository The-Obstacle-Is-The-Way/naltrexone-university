import { describe, expect, it } from 'vitest';
import {
  ApplicationConflictReasons,
  ApplicationError,
  practiceSessionAlreadyEndedError,
  practiceSessionStateChangedConcurrentlyError,
  rollbackCertainPersistenceError,
} from '@/src/application/errors';
import {
  IdempotentActionNames,
  isConcurrentRequestInProgressError,
  rotateGeneratedIdempotencyKeyAfterDeterminateError,
  rotateIdempotencyKeyAfterDeterminateError,
  shouldCacheBookmarkError,
  shouldCacheCheckoutSessionError,
  shouldCachePortalSessionError,
  shouldCacheQuestionMarkError,
  shouldCacheQuestionRatingError,
  shouldCacheQuestionReportError,
  shouldCacheStartPracticeSessionError,
  shouldCacheSubmitAnswerError,
  shouldRotateIdempotencyKeyAfterActionError,
} from './idempotency-error-policy';

const transientCases = [
  ['raw error', new Error('connection reset')],
  [
    'internal application error',
    new ApplicationError('INTERNAL_ERROR', 'database unavailable'),
  ],
  [
    'Stripe application error',
    new ApplicationError('STRIPE_ERROR', 'Stripe unavailable'),
  ],
] as const;

describe.each([
  ['checkout', shouldCacheCheckoutSessionError],
  ['portal', shouldCachePortalSessionError],
  ['bookmark', shouldCacheBookmarkError],
  ['question rating', shouldCacheQuestionRatingError],
  ['question report', shouldCacheQuestionReportError],
] as const)('%s idempotency error policy', (_name, policy) => {
  it.each(transientCases)('aborts the claim for %s', (_caseName, error) => {
    expect(policy(error)).toBe(false);
  });

  it('does not cache an unvetted bare conflict', () => {
    expect(policy(new ApplicationError('CONFLICT', 'Conflict'))).toBe(false);
  });
});

describe('checkout idempotency error policy', () => {
  it('aborts the time-dependent already-subscribed outcome', () => {
    // currentPeriodEnd > now can lapse within the cache TTL and the billing
    // surfaces use mount-fixed keys with no rotation, so a cached
    // ALREADY_SUBSCRIBED could pin a lapsed user out of re-checkout.
    expect(
      shouldCacheCheckoutSessionError(
        new ApplicationError('ALREADY_SUBSCRIBED', 'Already subscribed'),
      ),
    ).toBe(false);
  });
});

describe('portal idempotency error policy', () => {
  it('aborts the mutable customer-not-found outcome', () => {
    // A Stripe customer can be created by a later checkout while the billing
    // page's mount-fixed key is still live; the retry must re-execute.
    expect(
      shouldCachePortalSessionError(
        new ApplicationError('NOT_FOUND', 'Stripe customer not found'),
      ),
    ).toBe(false);
  });
});

describe('bookmark idempotency error policy', () => {
  it('caches the audited not-found outcome', () => {
    expect(
      shouldCacheBookmarkError(new ApplicationError('NOT_FOUND', 'Not found')),
    ).toBe(true);
  });
});

describe('start-practice-session idempotency error policy', () => {
  it.each(transientCases)('aborts a transient %s', (_name, error) => {
    expect(shouldCacheStartPracticeSessionError(error)).toBe(false);
  });

  it.each(['VALIDATION_ERROR', 'NOT_FOUND'] as const)(
    'caches the determinate %s outcome',
    (code) => {
      expect(
        shouldCacheStartPracticeSessionError(new ApplicationError(code, code)),
      ).toBe(true);
    },
  );

  it('caches the typed incomplete-session conflict', () => {
    expect(
      shouldCacheStartPracticeSessionError(
        new ApplicationError('CONFLICT', 'Incomplete session', undefined, {
          details: {
            reason: ApplicationConflictReasons.IncompleteSessionExists,
          },
        }),
      ),
    ).toBe(true);
  });

  it('aborts an unvetted bare conflict', () => {
    expect(
      shouldCacheStartPracticeSessionError(
        new ApplicationError('CONFLICT', 'Conflict'),
      ),
    ).toBe(false);
  });
});

describe.each([
  ['question rating', shouldCacheQuestionRatingError],
  ['question report', shouldCacheQuestionReportError],
] as const)('%s idempotency error policy', (_name, policy) => {
  it.each(['VALIDATION_ERROR', 'NOT_FOUND'] as const)(
    'caches the determinate %s outcome',
    (code) => {
      expect(policy(new ApplicationError(code, code))).toBe(true);
    },
  );
});

describe('submit-answer idempotency error policy', () => {
  it('aborts a rollback-certain persistence failure', () => {
    expect(
      shouldCacheSubmitAnswerError(
        rollbackCertainPersistenceError({ cause: { code: '57014' } }),
      ),
    ).toBe(false);
  });

  it('aborts a version-fence conflict', () => {
    expect(
      shouldCacheSubmitAnswerError(
        practiceSessionStateChangedConcurrentlyError(),
      ),
    ).toBe(false);
  });

  it.each([
    new Error('connection lost around commit'),
    new ApplicationError('INTERNAL_ERROR', 'commit outcome unknown'),
  ])('fences an indeterminate failure instead of re-executing it', (error) => {
    expect(shouldCacheSubmitAnswerError(error)).toBe(true);
  });

  it.each(['VALIDATION_ERROR', 'NOT_FOUND'] as const)(
    'caches the determinate %s outcome',
    (code) => {
      expect(
        shouldCacheSubmitAnswerError(new ApplicationError(code, code)),
      ).toBe(true);
    },
  );

  it('caches a typed terminal practice-session conflict', () => {
    expect(
      shouldCacheSubmitAnswerError(practiceSessionAlreadyEndedError()),
    ).toBe(true);
  });

  it('aborts an unvetted bare conflict', () => {
    expect(
      shouldCacheSubmitAnswerError(
        new ApplicationError('CONFLICT', 'Unclassified conflict'),
      ),
    ).toBe(false);
  });
});

describe('question-mark idempotency error policy', () => {
  it.each(transientCases)(
    'aborts the naturally replay-safe desired-state write for %s',
    (_caseName, error) => {
      expect(shouldCacheQuestionMarkError(error)).toBe(false);
    },
  );

  it('aborts a rollback-certain persistence failure', () => {
    expect(
      shouldCacheQuestionMarkError(
        rollbackCertainPersistenceError({ cause: { code: '57014' } }),
      ),
    ).toBe(false);
  });

  it('aborts a version-fence conflict', () => {
    expect(
      shouldCacheQuestionMarkError(
        practiceSessionStateChangedConcurrentlyError(),
      ),
    ).toBe(false);
  });

  it.each(['VALIDATION_ERROR', 'NOT_FOUND'] as const)(
    'caches the determinate %s outcome',
    (code) => {
      expect(
        shouldCacheQuestionMarkError(new ApplicationError(code, code)),
      ).toBe(true);
    },
  );

  it('caches a typed terminal practice-session conflict', () => {
    expect(
      shouldCacheQuestionMarkError(practiceSessionAlreadyEndedError()),
    ).toBe(true);
  });

  it('aborts an unvetted bare conflict', () => {
    expect(
      shouldCacheQuestionMarkError(
        new ApplicationError('CONFLICT', 'Unclassified conflict'),
      ),
    ).toBe(false);
  });
});

describe('client idempotency-key rotation policy', () => {
  it('identifies only the typed concurrent-request conflict', () => {
    expect(
      isConcurrentRequestInProgressError({
        code: 'CONFLICT',
        details: {
          reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
        },
      }),
    ).toBe(true);

    expect(
      isConcurrentRequestInProgressError({
        code: 'INTERNAL_ERROR',
        details: {
          reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
        },
      }),
    ).toBe(false);
    expect(
      isConcurrentRequestInProgressError({
        code: 'CONFLICT',
        details: {
          reason: ApplicationConflictReasons.IncompleteSessionExists,
        },
      }),
    ).toBe(false);
    expect(
      isConcurrentRequestInProgressError({
        code: 'CONFLICT',
      }),
    ).toBe(false);
  });

  it('generates and stores a replacement key only when both collaborators are available', () => {
    let generatedKeys = 0;
    let storedKey: string | null = null;
    const error = new ApplicationError('NOT_FOUND', 'Question not found');

    expect(
      rotateGeneratedIdempotencyKeyAfterDeterminateError(
        IdempotentActionNames.Bookmark,
        error,
        {
          createIdempotencyKey: () => {
            generatedKeys += 1;
            return 'idem_2';
          },
          setIdempotencyKey: (key) => {
            storedKey = key;
          },
        },
      ),
    ).toBe(true);
    expect(generatedKeys).toBe(1);
    expect(storedKey).toBe('idem_2');

    expect(
      rotateGeneratedIdempotencyKeyAfterDeterminateError(
        IdempotentActionNames.Bookmark,
        error,
        {
          createIdempotencyKey: () => {
            generatedKeys += 1;
            return 'idem_3';
          },
        },
      ),
    ).toBe(false);
    expect(
      rotateGeneratedIdempotencyKeyAfterDeterminateError(
        IdempotentActionNames.Bookmark,
        error,
        {
          setIdempotencyKey: (key) => {
            storedKey = key;
          },
        },
      ),
    ).toBe(false);
    expect(generatedKeys).toBe(1);
    expect(storedKey).toBe('idem_2');
  });

  it('invokes the supplied rotation only for a determinate cached error', () => {
    let rotations = 0;

    expect(
      rotateIdempotencyKeyAfterDeterminateError(
        IdempotentActionNames.Bookmark,
        new ApplicationError('NOT_FOUND', 'Question not found'),
        () => {
          rotations += 1;
        },
      ),
    ).toBe(true);
    expect(
      rotateIdempotencyKeyAfterDeterminateError(
        IdempotentActionNames.Bookmark,
        new ApplicationError('INTERNAL_ERROR', 'Outcome unknown'),
        () => {
          rotations += 1;
        },
      ),
    ).toBe(false);
    expect(rotations).toBe(1);
  });

  it.each([
    [
      IdempotentActionNames.Bookmark,
      new ApplicationError('NOT_FOUND', 'Question not found'),
    ],
    [
      IdempotentActionNames.QuestionRating,
      new ApplicationError('VALIDATION_ERROR', 'Invalid rating'),
    ],
    [
      IdempotentActionNames.QuestionReport,
      new ApplicationError('NOT_FOUND', 'Question not found'),
    ],
    [IdempotentActionNames.SubmitAnswer, practiceSessionAlreadyEndedError()],
    [
      IdempotentActionNames.QuestionMark,
      new ApplicationError('NOT_FOUND', 'Question not found'),
    ],
    [
      IdempotentActionNames.StartPracticeSession,
      new ApplicationError('NOT_FOUND', 'No questions found'),
    ],
    [
      IdempotentActionNames.StartPracticeSession,
      new ApplicationError('CONFLICT', 'Incomplete session exists', undefined, {
        details: {
          reason: ApplicationConflictReasons.IncompleteSessionExists,
        },
      }),
    ],
  ] as const)(
    'rotates %s after a determinate cached error',
    (action, error) => {
      expect(shouldRotateIdempotencyKeyAfterActionError(action, error)).toBe(
        true,
      );
    },
  );

  it.each([
    [
      IdempotentActionNames.Bookmark,
      new ApplicationError('INTERNAL_ERROR', 'Outcome unknown'),
    ],
    [
      IdempotentActionNames.SubmitAnswer,
      new ApplicationError('INTERNAL_ERROR', 'Outcome unknown'),
    ],
    [
      IdempotentActionNames.QuestionMark,
      practiceSessionStateChangedConcurrentlyError(),
    ],
    [
      IdempotentActionNames.StartPracticeSession,
      new ApplicationError('CONFLICT', 'Still running', undefined, {
        details: {
          reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
        },
      }),
    ],
  ] as const)(
    'preserves %s after an indeterminate or aborted error',
    (action, error) => {
      expect(shouldRotateIdempotencyKeyAfterActionError(action, error)).toBe(
        false,
      );
    },
  );
});
