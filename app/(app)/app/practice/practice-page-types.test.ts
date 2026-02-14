import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  QuestionDifficulty,
  QuestionProgressStatus,
} from '@/src/domain/value-objects';
import {
  difficultyDisplayLabel,
  type PracticeFilters,
  statusDisplayLabel,
} from './practice-page-types';

describe('statusDisplayLabel', () => {
  it('returns display labels for known statuses', () => {
    expect(statusDisplayLabel('unanswered')).toBe('Unanswered');
    expect(statusDisplayLabel('incorrect')).toBe('Incorrect');
    expect(statusDisplayLabel('bookmarked')).toBe('Bookmarked');
  });

  it('throws when given an unknown status', () => {
    expect(() =>
      statusDisplayLabel('unknown' as unknown as never),
    ).toThrowError('Unhandled QuestionProgressStatus: unknown');
  });

  it('rejects legacy marked status at type level', () => {
    // @ts-expect-error 'marked' is not a QuestionProgressStatus
    const status: QuestionProgressStatus = 'marked';
    void status;
  });
});

describe('difficultyDisplayLabel', () => {
  it('returns display labels for known difficulties', () => {
    expect(difficultyDisplayLabel('easy')).toBe('Easy');
    expect(difficultyDisplayLabel('medium')).toBe('Medium');
    expect(difficultyDisplayLabel('hard')).toBe('Hard');
  });

  it('throws when given an unknown difficulty', () => {
    expect(() =>
      difficultyDisplayLabel('unknown' as unknown as never),
    ).toThrowError('Unhandled QuestionDifficulty: unknown');
  });
});

describe('PracticeFilters', () => {
  it('uses single status + difficulty values', () => {
    expectTypeOf<
      PracticeFilters['status']
    >().toEqualTypeOf<QuestionProgressStatus>();
    expectTypeOf<
      PracticeFilters['difficulty']
    >().toEqualTypeOf<QuestionDifficulty | null>();
  });

  it('does not include legacy array fields', () => {
    // @ts-expect-error PracticeFilters no longer has `statuses`
    type _Statuses = PracticeFilters['statuses'];
    // @ts-expect-error PracticeFilters no longer has `difficulties`
    type _Difficulties = PracticeFilters['difficulties'];
  });
});
