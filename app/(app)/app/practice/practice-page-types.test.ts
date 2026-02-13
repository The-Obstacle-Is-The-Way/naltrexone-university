import { describe, expect, it } from 'vitest';
import { statusDisplayLabel } from './practice-page-types';

describe('statusDisplayLabel', () => {
  it('returns display labels for known statuses', () => {
    expect(statusDisplayLabel('unanswered')).toBe('Unanswered');
    expect(statusDisplayLabel('incorrect')).toBe('Incorrect');
    expect(statusDisplayLabel('marked')).toBe('Marked');
  });

  it('throws when given an unknown status', () => {
    expect(() =>
      statusDisplayLabel('unknown' as unknown as never),
    ).toThrowError('Unhandled QuestionProgressStatus: unknown');
  });
});
