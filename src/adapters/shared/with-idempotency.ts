import { ApplicationError, isApplicationError } from '@/src/application/errors';
import type { IdempotencyKeyRepository } from '@/src/application/ports/repositories';

const DEFAULT_TTL_MS = 86_400_000; // 24 hours
const DEFAULT_MAX_WAIT_MS = 2_000;
const DEFAULT_POLL_INTERVAL_MS = 50;
const ERROR_MESSAGE_LIMIT = 1000;
const PRUNE_BATCH_LIMIT = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  } catch {}

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
      await input.repo.storeError({
        userId: input.userId,
        action: input.action,
        key: input.key,
        error: toErrorRecord(error),
      });
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

    if (existing.resultJson !== null) {
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

    await sleep(pollIntervalMs);
  }

  throw new ApplicationError(
    'CONFLICT',
    'Request timed out waiting for idempotency key. The concurrent request may still be in progress or may have failed.',
  );
}
