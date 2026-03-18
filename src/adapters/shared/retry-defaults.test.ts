import { describe, expect, it } from 'vitest';
import { DEFAULT_RETRY_OPTIONS } from './retry-defaults';

describe('retry-defaults', () => {
  it('exports the shared retry policy', () => {
    expect(DEFAULT_RETRY_OPTIONS).toEqual({
      maxAttempts: 3,
      initialDelayMs: 100,
      factor: 2,
      maxDelayMs: 1000,
    });
  });
});
