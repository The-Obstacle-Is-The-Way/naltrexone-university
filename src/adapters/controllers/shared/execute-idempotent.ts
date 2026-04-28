import type { ZodType, ZodTypeDef } from 'zod';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
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
  execute,
}: {
  d: IdempotentControllerDeps;
  userId: string;
  idempotencyKey: string | null | undefined;
  action: string;
  outputSchema: ZodType<TOutput, ZodTypeDef, unknown>;
  execute: () => Promise<TOutput>;
}): Promise<TOutput> {
  if (!idempotencyKey) return execute();

  return withIdempotency({
    repo: d.idempotencyKeyRepository,
    logger: d.logger,
    userId,
    action,
    key: idempotencyKey,
    now: d.now,
    parseResult: (value) => outputSchema.parse(value),
    execute,
  });
}
