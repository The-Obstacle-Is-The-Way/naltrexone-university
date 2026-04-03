import {
  ApplicationError,
  type ApplicationErrorCode,
} from '@/src/application/errors';

export type CircuitBreakerOptions = {
  failureThreshold: number;
  resetTimeoutMs: number;
  openErrorCode: ApplicationErrorCode;
  openErrorMessage?: string;
};

type CircuitBreakerState = 'closed' | 'open' | 'half-open';

const DEFAULT_OPEN_CIRCUIT_MESSAGE = 'Service temporarily unavailable';

export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openedAtMs: number | null = null;
  private state: CircuitBreakerState = 'closed';
  private isProbeInFlight = false;

  constructor(
    private readonly options: CircuitBreakerOptions,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (
      !Number.isInteger(options.failureThreshold) ||
      options.failureThreshold <= 0
    ) {
      throw new Error(
        'CircuitBreaker: failureThreshold must be a positive integer',
      );
    }

    if (
      !Number.isFinite(options.resetTimeoutMs) ||
      options.resetTimeoutMs < 0
    ) {
      throw new Error(
        'CircuitBreaker: resetTimeoutMs must be a non-negative number',
      );
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (!this.isResetTimeoutElapsed()) {
        this.throwCircuitOpenError();
      }

      this.state = 'half-open';
    }

    if (this.state === 'half-open') {
      return this.executeHalfOpen(fn);
    }

    return this.executeClosed(fn);
  }

  private async executeClosed<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      this.close();
      return result;
    } catch (error) {
      this.consecutiveFailures += 1;

      if (this.consecutiveFailures >= this.options.failureThreshold) {
        this.open();
      }

      throw error;
    }
  }

  private async executeHalfOpen<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isProbeInFlight) {
      this.throwCircuitOpenError();
    }

    this.isProbeInFlight = true;

    try {
      const result = await fn();
      this.close();
      return result;
    } catch (error) {
      this.open();
      throw error;
    }
  }

  private isResetTimeoutElapsed(): boolean {
    return (
      this.openedAtMs !== null &&
      this.now() - this.openedAtMs >= this.options.resetTimeoutMs
    );
  }

  private close(): void {
    this.consecutiveFailures = 0;
    this.openedAtMs = null;
    this.state = 'closed';
    this.isProbeInFlight = false;
  }

  private open(): void {
    this.openedAtMs = this.now();
    this.state = 'open';
    this.isProbeInFlight = false;
  }

  private throwCircuitOpenError(): never {
    throw new ApplicationError(
      this.options.openErrorCode,
      this.options.openErrorMessage ?? DEFAULT_OPEN_CIRCUIT_MESSAGE,
    );
  }
}
