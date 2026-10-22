import { CircuitBreaker } from '@/src/adapters/shared/circuit-breaker';
import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import { DEFAULT_RETRY_OPTIONS } from '@/src/adapters/shared/retry-defaults';
import type { Logger } from '@/src/application/ports/logger';
import type { StripeCallBudget } from './stripe-call-budget';
import { isStripeConnectionError, isStripeOutage } from './stripe-errors';

const STRIPE_CIRCUIT_FAILURE_THRESHOLD = 5;
const STRIPE_CIRCUIT_RESET_TIMEOUT_MS = 60_000;
const STRIPE_OPEN_CIRCUIT_ERROR_CODE = 'STRIPE_ERROR';
const STRIPE_OPEN_CIRCUIT_MESSAGE = 'Stripe temporarily unavailable';

const stripeCircuitBreaker = new CircuitBreaker({
  failureThreshold: STRIPE_CIRCUIT_FAILURE_THRESHOLD,
  resetTimeoutMs: STRIPE_CIRCUIT_RESET_TIMEOUT_MS,
  openErrorCode: STRIPE_OPEN_CIRCUIT_ERROR_CODE,
  openErrorMessage: STRIPE_OPEN_CIRCUIT_MESSAGE,
  // DEBT-501 item 6: Stripe refusing a request answers it; only an outage
  // opens the circuit.
  isFailure: isStripeOutage,
});

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
  budget,
}: {
  operation: string;
  fn: () => Promise<T>;
  logger: Pick<Logger, 'warn'>;
  budget?: StripeCallBudget | undefined;
}): Promise<T> {
  if (budget) {
    // Refusing an already-exhausted caller is not a new provider failure.
    try {
      budget.requireRemainingMs();
    } catch (error) {
      return Promise.reject(error);
    }
    const wasCutShort = budget.startCall();
    return stripeCircuitBreaker.execute(fn, {
      // A connection failure the caller's own deadline caused says nothing
      // about Stripe's health: it neither counts nor closes the circuit.
      isIgnored: (error) => isStripeConnectionError(error) && wasCutShort(),
    });
  }
  return stripeCircuitBreaker.execute(() =>
    retry(fn, {
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
    }),
  );
}
