import type { ZodType } from 'zod';
import {
  type IdempotencyOutcomeStoreFailurePolicy,
  withIdempotency,
} from '@/src/adapters/shared/with-idempotency';
import type { Logger } from '@/src/application/ports/logger';
import type { IdempotencyKeyRepository } from '@/src/application/ports/repositories';

/**
 * Structural deps subset shared by every controller that wraps an action with
 * idempotency. Intentionally narrower than any concrete controller deps type.
 */
type IdempotentControllerDeps = {
  idempotencyKeyRepository: IdempotencyKeyRepository;
  logger: Logger;
  now: () => Date;
};

/**
 * Bridges the no-key fast path and keyed idempotency path so controller
 * actions can express their intent without repeating the plumbing block.
 */
export async function executeIdempotent<TOutput>({
  d,
  userId,
  idempotencyKey,
  action,
  outputSchema,
  beforeExecute,
  shouldCacheError,
  outcomeStoreFailurePolicy,
  execute,
}: {
  d: IdempotentControllerDeps;
  userId: string;
  idempotencyKey: string | null | undefined;
  action: string;
  outputSchema: ZodType<TOutput, unknown>;
  beforeExecute?: () => Promise<void>;
  shouldCacheError?: (error: unknown) => boolean;
  outcomeStoreFailurePolicy?: IdempotencyOutcomeStoreFailurePolicy;
  execute: () => Promise<TOutput>;
}): Promise<TOutput> {
  if (!idempotencyKey) {
    await beforeExecute?.();
    return execute();
  }

  return withIdempotency({
    repo: d.idempotencyKeyRepository,
    logger: d.logger,
    userId,
    action,
    key: idempotencyKey,
    now: d.now,
    // Release contract: an incompatible keyed-action output change must add
    // change-local replay parsers and pre-deploy fixtures for every writer
    // shape (including rollback targets) that can coexist inside the 24-hour
    // TTL. Retain each shape until its last writer has been absent for one
    // full TTL; do not replace this strict boundary with a cache miss or raw
    // JSON fallback. See docs/dev/deployment-procedure.md.
    parseResult: (value) => outputSchema.parse(value),
    ...(beforeExecute ? { beforeExecute } : {}),
    ...(shouldCacheError ? { shouldCacheError } : {}),
    ...(outcomeStoreFailurePolicy ? { outcomeStoreFailurePolicy } : {}),
    execute,
  });
}
