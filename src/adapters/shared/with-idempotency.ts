import { delay } from '@/src/adapters/shared/delay';
import { ApplicationError, isApplicationError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import {
  DEFAULT_IDEMPOTENCY_ZOMBIE_THRESHOLD_MS,
  type IdempotencyKeyRepository,
} from '@/src/application/ports/repositories';
import { DAY_MS } from '@/src/domain/services';
import { PRUNE_BATCH_LIMIT } from './prune-constants';

const DEFAULT_TTL_MS = DAY_MS;
const DEFAULT_MAX_WAIT_MS = 2_000;
const DEFAULT_POLL_INTERVAL_MS = 50;
const ERROR_MESSAGE_LIMIT = 1000;

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

function toErrorRecord(error: unknown): {
  code: ApplicationError['code'];
  message: string;
} {
  if (isApplicationError(error)) {
    return { code: error.code, message: error.message };
  }

  return { code: 'INTERNAL_ERROR', message: toErrorMessage(error) };
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

  const expiresAt = new Date(input.now().getTime() + ttlMs);
  const claimed = await input.repo.claim({
    userId: input.userId,
    action: input.action,
    key: input.key,
    expiresAt,
    zombieThresholdMs,
  });

  if (claimed) {
    try {
      const result = await input.execute();
      await input.repo.storeResult({
        userId: input.userId,
        action: input.action,
        key: input.key,
        resultJson: result,
      });
      return result;
    } catch (error) {
      try {
        await input.repo.storeError({
          userId: input.userId,
          action: input.action,
          key: input.key,
          error: toErrorRecord(error),
        });
      } catch (storeError) {
        try {
          input.logger.error(
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
        } catch {
          // Preserve original execute error even if logger.error throws.
        }
      }
      throw error;
    }
  }

  const startMs = input.now().getTime();
  let keyDisappearedDuringPoll = false;
  while (input.now().getTime() - startMs <= maxWaitMs) {
    const existing = await input.repo.find(
      input.userId,
      input.action,
      input.key,
    );
    if (!existing) {
      keyDisappearedDuringPoll = true;
      break;
    }

    if (existing.error) {
      throw new ApplicationError(existing.error.code, existing.error.message);
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

  if (keyDisappearedDuringPoll) {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Idempotency key disappeared during poll',
    );
  }

  throw new ApplicationError(
    'CONFLICT',
    'Request timed out waiting for idempotency key. The concurrent request may still be in progress or may have failed.',
  );
}
