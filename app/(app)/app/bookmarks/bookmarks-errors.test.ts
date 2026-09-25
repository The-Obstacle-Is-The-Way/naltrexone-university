import { describe, expect, it } from 'vitest';
import {
  getRemoveBookmarkErrorMessage,
  parseRemoveBookmarkErrorCode,
} from './bookmarks-errors';

describe('parseRemoveBookmarkErrorCode', () => {
  it.each(['missing_question_id', 'remove_failed'] as const)(
    'accepts the %s code',
    (code) => {
      expect(parseRemoveBookmarkErrorCode(code)).toBe(code);
    },
  );

  it('reads the first value of a repeated query parameter', () => {
    expect(
      parseRemoveBookmarkErrorCode(['remove_failed', 'missing_question_id']),
    ).toBe('remove_failed');
  });

  it.each([
    ['an absent parameter', undefined],
    ['an empty parameter', ''],
    ['an unknown code', 'something_else'],
  ] as const)('ignores %s', (_label, code) => {
    expect(parseRemoveBookmarkErrorCode(code)).toBeUndefined();
  });
});

describe('getRemoveBookmarkErrorMessage', () => {
  it.each([
    ['missing_question_id', 'Unable to remove bookmark: missing question id.'],
    ['remove_failed', 'Unable to remove bookmark. Please try again.'],
  ] as const)('maps %s to its message', (code, message) => {
    expect(getRemoveBookmarkErrorMessage(code)).toBe(message);
  });

  it('returns no message without a code', () => {
    expect(getRemoveBookmarkErrorMessage(undefined)).toBeNull();
  });
});
