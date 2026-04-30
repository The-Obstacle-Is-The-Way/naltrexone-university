import { beforeAll, describe, expect, it } from 'vitest';
import './practice-view-test-helpers';

type PracticeViewModule = typeof import('./practice-view');

let getBookmarkNotificationTransition: PracticeViewModule['getBookmarkNotificationTransition'];

beforeAll(async () => {
  getBookmarkNotificationTransition = (await import('./practice-view'))
    .getBookmarkNotificationTransition;
});

describe('getBookmarkNotificationTransition', () => {
  it('resets last key and returns no notification when message is null', () => {
    const transition = getBookmarkNotificationTransition({
      message: null,
      version: 1,
      bookmarkStatus: 'idle',
      lastKey: '1:hi',
    });

    expect(transition.nextKey).toBeNull();
    expect(transition.notification).toBeNull();
  });

  it('returns a success notification for new messages when status is not error', () => {
    const transition = getBookmarkNotificationTransition({
      message: 'Question bookmarked.',
      version: 2,
      bookmarkStatus: 'idle',
      lastKey: null,
    });

    expect(transition.nextKey).toBe('2:Question bookmarked.');
    expect(transition.notification).toEqual({
      message: 'Question bookmarked.',
      tone: 'success',
    });
  });

  it('returns an error notification when bookmarkStatus is error', () => {
    const transition = getBookmarkNotificationTransition({
      message: 'Failed.',
      version: 3,
      bookmarkStatus: 'error',
      lastKey: null,
    });

    expect(transition.notification).toEqual({
      message: 'Failed.',
      tone: 'error',
    });
  });

  it('returns no notification for duplicate messages', () => {
    const transition = getBookmarkNotificationTransition({
      message: 'Question bookmarked.',
      version: 2,
      bookmarkStatus: 'idle',
      lastKey: '2:Question bookmarked.',
    });

    expect(transition.nextKey).toBe('2:Question bookmarked.');
    expect(transition.notification).toBeNull();
  });
});
