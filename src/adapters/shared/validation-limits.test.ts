import { describe, expect, it } from 'vitest';
import {
  MAX_PAGINATION_LIMIT,
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,
  MAX_PRACTICE_SESSION_QUESTIONS,
  MAX_PRACTICE_SESSION_TAG_FILTERS,
  MAX_TIME_SPENT_SECONDS,
} from './validation-limits';

describe('validation-limits', () => {
  it('matches SSOT limits', () => {
    expect(MAX_PAGINATION_LIMIT).toBe(100);
    expect(MAX_TIME_SPENT_SECONDS).toBe(86_400);
    expect(MAX_PRACTICE_SESSION_QUESTIONS).toBe(200);
    expect(MAX_PRACTICE_SESSION_TAG_FILTERS).toBe(50);
    expect(MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS).toBe(3);
  });
});
