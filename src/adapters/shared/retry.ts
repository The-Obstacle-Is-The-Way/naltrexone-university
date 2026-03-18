import { delay } from '@/src/adapters/shared/delay';
import {
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_TOO_MANY_REQUESTS,
} from './http-status';

export type RetryAttemptInfo = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: unknown;
};

export type RetryOptions = {
  maxAttempts: number;
  initialDelayMs: number;
  factor: number;
  maxDelayMs?: number;
  shouldRetry: (error: unknown) => boolean;
  onRetry?: (info: RetryAttemptInfo) => void;
  sleep?: (ms: number) => Promise<void>;
};

const HTTP_SERVER_ERROR_EXCLUSIVE_UPPER_BOUND = 600;

function getStringProp(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string' ? record[key] : null;
}

function getNumberProp(value: unknown, key: string): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record[key] === 'number' ? record[key] : null;
}

export function isTransientExternalError(error: unknown): boolean {
  const code = getStringProp(error, 'code');
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'EHOSTUNREACH' ||
    code === 'EPIPE'
  ) {
    return true;
  }

  const statusCode =
    getNumberProp(error, 'statusCode') ?? getNumberProp(error, 'status');
  if (statusCode === HTTP_TOO_MANY_REQUESTS) {
    return true;
  }

  if (
    typeof statusCode === 'number' &&
    statusCode >= HTTP_INTERNAL_SERVER_ERROR &&
    statusCode < HTTP_SERVER_ERROR_EXCLUSIVE_UPPER_BOUND
  ) {
    return true;
  }

  return false;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts <= 0) {
    throw new Error('retry(): maxAttempts must be a positive integer');
  }

  if (!Number.isFinite(options.initialDelayMs) || options.initialDelayMs < 0) {
    throw new Error('retry(): initialDelayMs must be a non-negative number');
  }

  if (!Number.isFinite(options.factor) || options.factor <= 0) {
    throw new Error('retry(): factor must be a positive number');
  }

  const sleep = options.sleep ?? delay;
  const maxDelayMs = options.maxDelayMs;

  let delayMs = options.initialDelayMs;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const shouldRetry = options.shouldRetry(error);
      if (!shouldRetry || attempt >= options.maxAttempts) {
        throw error;
      }

      const clampedDelayMs =
        typeof maxDelayMs === 'number'
          ? Math.min(delayMs, maxDelayMs)
          : delayMs;

      options.onRetry?.({
        attempt,
        maxAttempts: options.maxAttempts,
        delayMs: clampedDelayMs,
        error,
      });

      await sleep(clampedDelayMs);
      delayMs *= options.factor;
    }
  }

  throw new Error('retry(): exceeded maxAttempts');
}
