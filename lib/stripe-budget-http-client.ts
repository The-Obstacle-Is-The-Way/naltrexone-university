import Stripe from 'stripe';
import type { StripeCallBudget } from '@/src/adapters/gateways/stripe/stripe-call-budget';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger } from '@/src/application/ports/logger';

const RETRY_DELAY_MS = 500;
type FetchClient = ReturnType<typeof Stripe.createFetchHttpClient>;
type FetchResponse = Awaited<ReturnType<FetchClient['makeRequest']>>;

function shouldRetry(response: FetchResponse): boolean {
  const directive = response.getHeaders()['stripe-should-retry'];
  if (directive === 'false') return false;
  if (directive === 'true') return true;
  return (
    response.getStatusCode() === 409 ||
    response.getStatusCode() === 429 ||
    response.getStatusCode() >= 500
  );
}

function terminalError(error: unknown): unknown {
  // The SDK retries these codes even with maxNetworkRetries: 0. This
  // transport already owns that retry. Keep the cause without its top-level
  // code, so the SDK still reports an unknown StripeConnectionError outcome.
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    Stripe.HttpClient.CONNECTION_CLOSED_ERROR_CODES.includes(error.code)
  ) {
    return new Error('Stripe connection closed', { cause: error });
  }
  return error;
}

/** One SDK invocation retains its headers and idempotency key across attempts. */
export class StripeBudgetHttpClient {
  constructor(
    private readonly delegate: FetchClient,
    private readonly budget: StripeCallBudget,
    private readonly attemptTimeoutMs: number,
    private readonly logger?: Pick<Logger, 'warn'>,
  ) {}

  getClientName(): string {
    return this.delegate.getClientName();
  }

  private logRetry(
    args: Parameters<FetchClient['makeRequest']>,
    error: unknown,
    statusCode?: number,
  ): void {
    // Log only the SDK's resource family, without path IDs or query values.
    const resource = args[2].split('?')[0]?.split('/')[2];
    try {
      this.logger?.warn(
        {
          operation: `${args[3]} ${resource && /^[a-z_]+$/.test(resource) ? resource : 'stripe'}`,
          attempt: 1,
          maxAttempts: 2,
          delayMs: RETRY_DELAY_MS,
          ...(statusCode === undefined ? {} : { statusCode }),
          error: projectSafeErrorDiagnostics(error),
        },
        'Retrying Stripe API call',
      );
    } catch {
      // Retry telemetry must not abort recovery of the provider call.
    }
  }

  async makeRequest(
    ...args: Parameters<FetchClient['makeRequest']>
  ): Promise<FetchResponse> {
    for (let attempt = 0; ; attempt += 1) {
      const remaining = this.budget.remainingMs();
      if (remaining <= 0) throw Stripe.HttpClient.makeTimeoutError();
      // The fetch client's timer also aborts stalled/trickling response bodies.
      const requestArgs: Parameters<FetchClient['makeRequest']> = [...args];
      requestArgs[7] = Math.ceil(
        Math.min(args[7], this.attemptTimeoutMs, remaining),
      );
      let response: FetchResponse;
      try {
        response = await this.delegate.makeRequest(...requestArgs);
      } catch (error) {
        if (
          attempt === 0 &&
          (await this.budget.waitBeforeRetry(RETRY_DELAY_MS, () =>
            this.logRetry(args, error),
          ))
        )
          continue;
        throw terminalError(error);
      }
      if (
        attempt > 0 ||
        !shouldRetry(response) ||
        this.budget.remainingMs() <= RETRY_DELAY_MS
      ) {
        return response;
      }
      // toStream releases the SDK timer; cancel its body before backing off.
      await response.toStream(() => {})?.cancel();
      if (
        !(await this.budget.waitBeforeRetry(RETRY_DELAY_MS, () =>
          this.logRetry(args, undefined, response.getStatusCode()),
        ))
      ) {
        throw Stripe.HttpClient.makeTimeoutError();
      }
    }
  }
}
