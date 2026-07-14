import { delay } from '@/src/adapters/shared/delay';
import {
  ApplicationConflictReasons,
  ApplicationError,
  isApplicationError,
} from '@/src/application/errors';
import type { Logger, LoggerContext } from '@/src/application/ports/logger';
import {
  DEFAULT_IDEMPOTENCY_ZOMBIE_THRESHOLD_MS,
  type IdempotencyKeyError,
  type IdempotencyKeyRepository,
} from '@/src/application/ports/repositories';
import { DAY_MS } from '@/src/domain/services';
import { PRUNE_BATCH_LIMIT } from './prune-constants';

const DEFAULT_TTL_MS = DAY_MS;
const DEFAULT_MAX_WAIT_MS = 2_000;
const DEFAULT_POLL_INTERVAL_MS = 50;
const ERROR_MESSAGE_LIMIT = 1000;

/**
 * Owner-selected handling after execute has succeeded but the cache outcome
 * cannot be stored. `return-result` is an owner assertion that the business
 * result remains authoritative and replay-safe even if the claim was fenced.
 * Without that opt-in, stale-claim errors continue to propagate.
 */
export type IdempotencyOutcomeStoreFailurePolicy =
  | 'return-result'
  | 'cache-error-and-throw';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message || error.name;
    return message.length > ERROR_MESSAGE_LIMIT
      ? `${message.slice(0, ERROR_MESSAGE_LIMIT)}…`
      : message;
  }

  const message = String(error);
  return message.length > ERROR_MESSAGE_LIMIT
    ? `${message.slice(0, ERROR_MESSAGE_LIMIT)}…`
    : message;
}

function toErrorRecord(error: unknown): IdempotencyKeyError {
  if (isApplicationError(error)) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }

  return { code: 'INTERNAL_ERROR', message: toErrorMessage(error) };
}

function safeLogError(
  logger: Logger,
  context: LoggerContext,
  msg: string,
): void {
  try {
    logger.error(context, msg);
  } catch {
    // Preserve the primary outcome even if logging fails.
  }
}

function shouldCacheExecutionError(
  shouldCacheError: ((error: unknown) => boolean) | undefined,
  error: unknown,
): boolean {
  if (!shouldCacheError) return true;

  try {
    return shouldCacheError(error);
  } catch {
    // Cache the original execute error if the policy itself fails.
    return true;
  }
}

async function abortClaimPreservingOriginalError(
  input: {
    repo: IdempotencyKeyRepository;
    logger: Logger;
    userId: string;
    action: string;
    key: string;
  },
  claimedAt: Date,
  originalError: unknown,
  message: string,
): Promise<void> {
  try {
    await input.repo.abortClaim(
      input.userId,
      input.action,
      input.key,
      claimedAt,
    );
  } catch (abortError) {
    safeLogError(
      input.logger,
      {
        userId: input.userId,
        action: input.action,
        key: input.key,
        abortError:
          abortError instanceof Error ? abortError.message : String(abortError),
        originalError:
          originalError instanceof Error
            ? originalError.message
            : String(originalError),
      },
      message,
    );
  }
}

export async function withIdempotency<T>(input: {
  repo: IdempotencyKeyRepository;
  logger: Logger;
  userId: string;
  action: string;
  key: string;
  now: () => Date;
  ttlMs?: number;
  maxWaitMs?: number;
  pollIntervalMs?: number;
  zombieThresholdMs?: number;
  parseResult?: (value: unknown) => T;
  beforeExecute?: () => Promise<void>;
  shouldCacheError?: (error: unknown) => boolean;
  outcomeStoreFailurePolicy?: IdempotencyOutcomeStoreFailurePolicy;
  execute: () => Promise<T>;
}): Promise<T> {
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const maxWaitMs = input.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const zombieThresholdMs =
    input.zombieThresholdMs ?? DEFAULT_IDEMPOTENCY_ZOMBIE_THRESHOLD_MS;

  // Best-effort cleanup so expired idempotency rows don't accumulate forever.
  // Pruning failures must not block the caller's request.
  try {
    await input.repo.pruneExpiredBefore(input.now(), PRUNE_BATCH_LIMIT);
  } catch (error) {
    input.logger.warn(
      {
        userId: input.userId,
        action: input.action,
        key: input.key,
        error: error instanceof Error ? error.message : String(error),
      },
      'Idempotency prune failed',
    );
  }

  const startMs = input.now().getTime();

  while (input.now().getTime() - startMs <= maxWaitMs) {
    const expiresAt = new Date(input.now().getTime() + ttlMs);
    const claimedAt = await input.repo.claim({
      userId: input.userId,
      action: input.action,
      key: input.key,
      expiresAt,
      zombieThresholdMs,
    });

    if (claimedAt) {
      if (input.beforeExecute) {
        try {
          await input.beforeExecute();
        } catch (error) {
          await abortClaimPreservingOriginalError(
            input,
            claimedAt,
            error,
            'Failed to abort idempotency claim after beforeExecute failure',
          );
          throw error;
        }
      }

      let result: T;
      try {
        result = await input.execute();
      } catch (error) {
        if (!shouldCacheExecutionError(input.shouldCacheError, error)) {
          await abortClaimPreservingOriginalError(
            input,
            claimedAt,
            error,
            'Failed to abort idempotency claim after non-cacheable execute error',
          );
          throw error;
        }

        try {
          await input.repo.storeError({
            userId: input.userId,
            action: input.action,
            key: input.key,
            claimedAt,
            error: toErrorRecord(error),
          });
        } catch (storeError) {
          safeLogError(
            input.logger,
            {
              userId: input.userId,
              action: input.action,
              key: input.key,
              storeError:
                storeError instanceof Error
                  ? storeError.message
                  : String(storeError),
              originalError:
                error instanceof Error ? error.message : String(error),
            },
            'Failed to persist idempotency error record',
          );
        }
        throw error;
      }

      try {
        await input.repo.storeResult({
          userId: input.userId,
          action: input.action,
          key: input.key,
          claimedAt,
          resultJson: result,
        });
      } catch (storeResultError) {
        const isStaleClaim =
          isApplicationError(storeResultError) &&
          storeResultError.code === 'NOT_FOUND';
        if (
          isStaleClaim &&
          input.outcomeStoreFailurePolicy !== 'return-result'
        ) {
          throw storeResultError;
        }

        const outcomeError = new ApplicationError(
          'INTERNAL_ERROR',
          'Idempotency outcome could not be recorded after committed success',
          undefined,
          { cause: storeResultError },
        );

        if (input.outcomeStoreFailurePolicy === 'cache-error-and-throw') {
          try {
            await input.repo.storeError({
              userId: input.userId,
              action: input.action,
              key: input.key,
              claimedAt,
              error: toErrorRecord(outcomeError),
            });
            safeLogError(
              input.logger,
              {
                userId: input.userId,
                action: input.action,
                key: input.key,
                storeResultError: toErrorMessage(storeResultError),
              },
              'Idempotency outcome write failed after committed success; cached indeterminate error',
            );
          } catch (storeError) {
            safeLogError(
              input.logger,
              {
                userId: input.userId,
                action: input.action,
                key: input.key,
                storeError: toErrorMessage(storeError),
                storeResultError: toErrorMessage(storeResultError),
              },
              'Failed to persist indeterminate idempotency outcome',
            );
          }
          throw outcomeError;
        }

        safeLogError(
          input.logger,
          {
            userId: input.userId,
            action: input.action,
            key: input.key,
            storeResultError: toErrorMessage(storeResultError),
          },
          'Idempotency outcome write failed after committed success',
        );
      }

      return result;
    }

    let shouldRestartClaim = false;
    while (input.now().getTime() - startMs <= maxWaitMs) {
      const existing = await input.repo.find(
        input.userId,
        input.action,
        input.key,
      );
      if (!existing) {
        shouldRestartClaim = true;
        break;
      }

      if (existing.error) {
        throw new ApplicationError(
          existing.error.code,
          existing.error.message,
          undefined,
          existing.error.details
            ? { details: existing.error.details }
            : undefined,
        );
      }

      if (existing.completedAt !== null) {
        if (!input.parseResult) {
          return existing.resultJson as T;
        }

        try {
          return input.parseResult(existing.resultJson);
        } catch (cause) {
          throw new ApplicationError(
            'INTERNAL_ERROR',
            'Cached idempotency result is invalid',
            undefined,
            { cause },
          );
        }
      }

      await delay(pollIntervalMs);
    }

    if (!shouldRestartClaim) {
      break;
    }
  }

  throw new ApplicationError(
    'CONFLICT',
    'Request timed out waiting for idempotency key. The concurrent request may still be in progress or may have failed.',
    undefined,
    {
      details: {
        reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
      },
    },
  );
}
