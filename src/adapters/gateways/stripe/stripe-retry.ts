import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import type { Logger } from '@/src/application/ports/logger';

const STRIPE_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 100,
  factor: 2,
  maxDelayMs: 1000,
} as const;

function toStripeErrorContext(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const record = error as Error & Record<string, unknown>;
    return {
      name: error.name,
      message: error.message,
      code: typeof record.code === 'string' ? record.code : null,
      statusCode:
        typeof record.statusCode === 'number' ? record.statusCode : null,
      status: typeof record.status === 'number' ? record.status : null,
    };
  }

  return { error: String(error) };
}

export function callStripeWithRetry<T>({
  operation,
  fn,
  logger,
}: {
  operation: string;
  fn: () => Promise<T>;
  logger: Logger;
}): Promise<T> {
  return retry(fn, {
    ...STRIPE_RETRY_OPTIONS,
    shouldRetry: isTransientExternalError,
    onRetry: ({ attempt, maxAttempts, delayMs, error }) => {
      logger.warn(
        {
          operation,
          attempt,
          maxAttempts,
          delayMs,
          error: toStripeErrorContext(error),
        },
        'Retrying Stripe API call',
      );
    },
  });
}
