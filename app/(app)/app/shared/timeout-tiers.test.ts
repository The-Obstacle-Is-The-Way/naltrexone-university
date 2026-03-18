import { describe, expect, it } from 'vitest';
import {
  STANDARD_MUTATION_TIMEOUT_MS,
  STANDARD_READ_TIMEOUT_MS,
} from './timeout-tiers';

describe('timeout-tiers', () => {
  it('exports the shared read and mutation timeout tiers', () => {
    expect(STANDARD_READ_TIMEOUT_MS).toBe(10_000);
    expect(STANDARD_MUTATION_TIMEOUT_MS).toBe(15_000);
  });
});
