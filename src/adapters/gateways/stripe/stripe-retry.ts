import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import { DEFAULT_RETRY_OPTIONS } from '@/src/adapters/shared/retry-defaults';
import type { Logger } from '@/src/application/ports/logger';

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
    ...DEFAULT_RETRY_OPTIONS,
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
