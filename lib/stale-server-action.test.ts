import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import { describe, expect, it } from 'vitest';
import {
  claimStaleActionReload,
  isStaleServerActionError,
  readSessionStorage,
  STALE_ACTION_RELOAD_KEY,
  STALE_ACTION_RELOAD_WINDOW_MS,
} from './stale-server-action';

function memoryStore(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

const throwingStore = {
  getItem: (): string | null => {
    throw new Error('storage blocked');
  },
  setItem: () => {
    throw new Error('storage blocked');
  },
};

describe('isStaleServerActionError', () => {
  it("recognizes the error Next.js throws for an action the server doesn't have", () => {
    const error = new UnrecognizedActionError(
      'Server Action "abc" was not found on the server.',
    );

    expect(isStaleServerActionError(error)).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isStaleServerActionError(new Error('boom'))).toBe(false);
    expect(
      isStaleServerActionError(new Error('Question "abc" was not found')),
    ).toBe(false);
    expect(isStaleServerActionError(new TypeError('Failed to fetch'))).toBe(
      false,
    );
  });

  it('ignores values that are not errors', () => {
    expect(isStaleServerActionError(undefined)).toBe(false);
    expect(isStaleServerActionError({ name: 'UnrecognizedActionError' })).toBe(
      false,
    );
  });
});

describe('claimStaleActionReload', () => {
  const now = 1_000_000_000;

  it('allows the first reload', () => {
    expect(claimStaleActionReload(memoryStore(), now)).toBe(true);
  });

  it('refuses a second reload inside the window, so a page cannot loop', () => {
    const store = memoryStore();
    claimStaleActionReload(store, now);

    expect(
      claimStaleActionReload(store, now + STALE_ACTION_RELOAD_WINDOW_MS - 1),
    ).toBe(false);
  });

  it('allows a reload again once the window has passed', () => {
    const store = memoryStore();
    claimStaleActionReload(store, now);

    expect(
      claimStaleActionReload(store, now + STALE_ACTION_RELOAD_WINDOW_MS),
    ).toBe(true);
  });

  it('does not let a refused attempt extend the window', () => {
    const store = memoryStore();
    claimStaleActionReload(store, now);
    claimStaleActionReload(store, now + STALE_ACTION_RELOAD_WINDOW_MS - 1);

    expect(
      claimStaleActionReload(store, now + STALE_ACTION_RELOAD_WINDOW_MS),
    ).toBe(true);
  });

  it('allows a reload when the recorded time is in the future, after a clock change', () => {
    const store = memoryStore();
    claimStaleActionReload(store, now + 10 * STALE_ACTION_RELOAD_WINDOW_MS);

    expect(claimStaleActionReload(store, now)).toBe(true);
  });

  it('treats an unreadable marker as no earlier reload', () => {
    const store = memoryStore();
    store.setItem(STALE_ACTION_RELOAD_KEY, 'not a time');

    expect(claimStaleActionReload(store, now)).toBe(true);
  });

  it('does not reload without storage, since nothing could stop a loop', () => {
    expect(claimStaleActionReload(undefined, now)).toBe(false);
    expect(claimStaleActionReload(throwingStore, now)).toBe(false);
  });
});

describe('readSessionStorage', () => {
  it('returns the session storage when it can be read', () => {
    const store = memoryStore();

    expect(readSessionStorage({ sessionStorage: store })).toBe(store);
  });

  it('returns undefined when reading it throws, as blocked site data does', () => {
    const blocked = {
      get sessionStorage(): Storage {
        throw new DOMException('denied', 'SecurityError');
      },
    };

    expect(readSessionStorage(blocked)).toBeUndefined();
  });
});
