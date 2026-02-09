import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBookmark } from './index';

describe('createBookmark', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns defaults when no overrides provided', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-09T12:00:00.000Z'));

    const bookmark = createBookmark();

    expect(bookmark).toEqual({
      userId: 'user-1',
      questionId: 'question-1',
      createdAt: new Date('2026-02-09T12:00:00.000Z'),
    });
  });

  it('applies overrides', () => {
    const createdAt = new Date('2026-02-10T00:00:00.000Z');

    const bookmark = createBookmark({
      userId: 'user-2',
      questionId: 'question-2',
      createdAt,
    });

    expect(bookmark).toEqual({
      userId: 'user-2',
      questionId: 'question-2',
      createdAt,
    });
  });
});
