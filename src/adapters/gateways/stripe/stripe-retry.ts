import { CircuitBreaker } from '@/src/adapters/shared/circuit-breaker';
import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import { DEFAULT_RETRY_OPTIONS } from '@/src/adapters/shared/retry-defaults';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger } from '@/src/application/ports/logger';
import { isStripeOutage } from './stripe-errors';

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

export function callStripeWithRetry<T>({
  operation,
  fn,
  logger,
}: {
  operation: string;
  fn: () => Promise<T>;
  logger: Logger;
}): Promise<T> {
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
            error: projectSafeErrorDiagnostics(error),
          },
          'Retrying Stripe API call',
        );
      },
    }),
  );
}
