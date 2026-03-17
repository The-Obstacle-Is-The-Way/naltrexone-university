import { describe, expect, it } from 'vitest';
import { PRUNE_BATCH_LIMIT } from './prune-constants';

describe('prune-constants', () => {
  it('exports the shared prune batch size', () => {
    expect(PRUNE_BATCH_LIMIT).toBe(100);
  });
});
