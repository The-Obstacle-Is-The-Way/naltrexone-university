import { delay } from '@/src/adapters/shared/delay';
import { ApplicationError, isApplicationError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type { IdempotencyKeyRepository } from '@/src/application/ports/repositories';

const DEFAULT_TTL_MS = 86_400_000; // 24 hours
const DEFAULT_MAX_WAIT_MS = 2_000;
const DEFAULT_POLL_INTERVAL_MS = 50;
const ERROR_MESSAGE_LIMIT = 1000;
const PRUNE_BATCH_LIMIT = 100;

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
  parseResult?: (value: unknown) => T;
  execute: () => Promise<T>;
}): Promise<T> {
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const maxWaitMs = input.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

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
      }
      throw error;
    }
  }

  const startMs = input.now().getTime();
  while (input.now().getTime() - startMs <= maxWaitMs) {
    const existing = await input.repo.find(
      input.userId,
      input.action,
      input.key,
    );
    if (!existing) {
      break;
    }

    if (existing.error) {
      throw new ApplicationError(existing.error.code, existing.error.message);
    }

    // Backward compatibility: legacy rows may predate completedAt and still
    // have a non-null cached payload.
    if (existing.completedAt !== null || existing.resultJson !== null) {
      if (!input.parseResult) {
        return existing.resultJson as T;
      }

      try {
        return input.parseResult(existing.resultJson);
      } catch {
        throw new ApplicationError(
          'INTERNAL_ERROR',
          'Cached idempotency result is invalid',
        );
      }
    }

    await delay(pollIntervalMs);
  }

  throw new ApplicationError(
    'CONFLICT',
    'Request timed out waiting for idempotency key. The concurrent request may still be in progress or may have failed.',
  );
}
