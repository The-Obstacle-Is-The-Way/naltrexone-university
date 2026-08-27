export const STRIPE_PROVIDER_STATE_WAIT_BUDGET_MS = 15_000;

const INITIAL_POLL_DELAY_MS = 150;
const MAX_POLL_DELAY_MS = 500;

export type StripeProviderPollDeadline = {
  readonly startedAtMs: number;
  readonly expiresAtMs: number;
};

type StripeProviderPollInput<T> = {
  readonly deadline?: StripeProviderPollDeadline;
  readonly description: string;
  readonly fetch: () => Promise<T>;
  readonly isDone: (value: T) => boolean;
  readonly describeValue: (value: T) => string;
};

type StripeProviderPollRuntime = {
  readonly now: () => number;
  readonly sleep: (delayMs: number) => Promise<void>;
};

const systemRuntime: StripeProviderPollRuntime = {
  now: Date.now,
  sleep: (delayMs) =>
    new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    }),
};

export function createStripeProviderPollDeadline(
  now: () => number = Date.now,
): StripeProviderPollDeadline {
  const startedAtMs = now();
  return {
    startedAtMs,
    expiresAtMs: startedAtMs + STRIPE_PROVIDER_STATE_WAIT_BUDGET_MS,
  };
}

export async function pollStripeProviderState<T>(
  input: StripeProviderPollInput<T>,
  runtime: StripeProviderPollRuntime = systemRuntime,
): Promise<T> {
  const deadline =
    input.deadline ?? createStripeProviderPollDeadline(runtime.now);
  let delayMs = INITIAL_POLL_DELAY_MS;
  let lastValueDescription = 'no value returned';

  while (runtime.now() < deadline.expiresAtMs) {
    const value = await input.fetch();
    lastValueDescription = input.describeValue(value);
    if (input.isDone(value)) return value;

    const remainingMs = deadline.expiresAtMs - runtime.now();
    if (remainingMs <= 0) break;
    await runtime.sleep(Math.min(delayMs, remainingMs));
    delayMs = Math.min(MAX_POLL_DELAY_MS, Math.ceil(delayMs * 1.5));
  }

  const elapsedMs = runtime.now() - deadline.startedAtMs;
  throw new Error(
    `${input.description} timed out after ${elapsedMs}ms (budget ${STRIPE_PROVIDER_STATE_WAIT_BUDGET_MS}ms); last observed ${lastValueDescription}`,
  );
}
