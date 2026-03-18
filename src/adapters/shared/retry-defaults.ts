import type { RetryOptions } from './retry';

type SharedRetryOptions = Pick<
  RetryOptions,
  'maxAttempts' | 'initialDelayMs' | 'factor' | 'maxDelayMs'
>;

export const DEFAULT_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 100,
  factor: 2,
  maxDelayMs: 1000,
} as const satisfies SharedRetryOptions;
