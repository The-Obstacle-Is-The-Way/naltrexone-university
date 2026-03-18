import { describe, expect, it } from 'vitest';
import { STACK_TRACE_LIMIT } from './error-logging-constants';

describe('error-logging-constants', () => {
  it('exports the shared stack truncation limit', () => {
    expect(STACK_TRACE_LIMIT).toBe(1000);
  });
});
