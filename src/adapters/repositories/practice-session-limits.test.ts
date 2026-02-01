import { describe, expect, it } from 'vitest';
import {
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,
  MAX_PRACTICE_SESSION_QUESTIONS,
  MAX_PRACTICE_SESSION_TAG_FILTERS,
} from './practice-session-limits';

describe('practice-session-limits', () => {
  it('matches SSOT limits', () => {
    expect(MAX_PRACTICE_SESSION_QUESTIONS).toBe(200);
    expect(MAX_PRACTICE_SESSION_TAG_FILTERS).toBe(50);
    expect(MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS).toBe(3);
  });
});
