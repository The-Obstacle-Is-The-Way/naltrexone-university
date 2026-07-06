import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  EXAM_FINAL_DRAFT_FLUSH_GRACE_MS,
  MS_PER_SECOND,
  SECONDS_PER_DAY,
} from './time-constants';

describe('time-constants', () => {
  it('exports canonical runtime time primitives', () => {
    expect(MS_PER_SECOND).toBe(1000);
    expect(EXAM_FINAL_DRAFT_FLUSH_GRACE_MS).toBe(15_000);
    expect(SECONDS_PER_DAY).toBe(86_400);
    expect(DAY_MS).toBe(86_400_000);
  });
});
