import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  createClerkE2ESession,
  ensureClerkE2ESession,
  releaseClerkE2ESession,
  requireStoredClerkE2ESession,
  waitForActiveClerkSession,
} from './clerk-auth';

class FakeClerkPage {
  readonly visitedUrls: string[] = [];

  async goto(url: string): Promise<void> {
    this.visitedUrls.push(url);
  }
}

class FakeClerkDriver {
  signInCount = 0;
  signOutCount = 0;
  waitForActiveSessionCount = 0;
  waitForSignedOutCount = 0;

  constructor(private active: boolean) {}

  async hasActiveSession(): Promise<boolean> {
    return this.active;
  }

  async load(): Promise<void> {}

  async signIn(): Promise<void> {
    this.signInCount += 1;
    this.active = true;
  }

  async signOut(): Promise<void> {
    this.signOutCount += 1;
    this.active = false;
  }

  async waitForActiveSession(): Promise<void> {
    this.waitForActiveSessionCount += 1;
    if (!this.active) throw new Error('Expected an active fake Clerk session');
  }

  async waitForSignedOut(): Promise<void> {
    this.waitForSignedOutCount += 1;
    if (this.active) throw new Error('Expected the fake Clerk session to end');
  }
}

describe('waitForActiveClerkSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits for an active browser session after Clerk sign-in completes', async () => {
    const waitResult = createDeferred<void>();
    const observedReadiness: boolean[] = [];
    const page = {
      waitForFunction: vi.fn(async (predicate: () => boolean) => {
        vi.stubGlobal('window', {});
        observedReadiness.push(predicate());
        vi.stubGlobal('window', { Clerk: { session: {} } });
        observedReadiness.push(predicate());
        await waitResult.promise;
      }),
    };

    let completed = false;
    const sessionWait = waitForActiveClerkSession(page).then(() => {
      completed = true;
    });

    expect(page.waitForFunction).toHaveBeenCalledOnce();
    expect(observedReadiness).toEqual([false, true]);
    await Promise.resolve();
    expect(completed).toBe(false);

    waitResult.resolve();
    await sessionWait;
    expect(completed).toBe(true);
  });
});

describe('ensureClerkE2ESession', () => {
  it('reuses an active stored session without creating another Clerk session', async () => {
    const page = new FakeClerkPage();
    const clerkDriver = new FakeClerkDriver(true);

    await ensureClerkE2ESession({
      clerkDriver,
      page,
      password: 'test-password',
      username: 'test-user@example.test',
    });

    expect(page.visitedUrls).toEqual(['/']);
    expect(clerkDriver.signInCount).toBe(0);
  });

  it('creates one session when the stored state is not authenticated', async () => {
    const page = new FakeClerkPage();
    const clerkDriver = new FakeClerkDriver(false);

    await ensureClerkE2ESession({
      clerkDriver,
      page,
      password: 'test-password',
      username: 'test-user@example.test',
    });

    expect(page.visitedUrls).toEqual(['/', '/sign-in']);
    expect(clerkDriver.signInCount).toBe(1);
    expect(clerkDriver.waitForActiveSessionCount).toBe(1);
  });
});

// BUG-328: each setup attempt runs in a new browser, and teardown signs out
// only the stored session, so a failed attempt must sign out its own.
describe('createClerkE2ESession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const credentials = {
    password: 'test-password',
    username: 'test-user@example.test',
  };

  it('saves the session it creates', async () => {
    const clerkDriver = new FakeClerkDriver(false);
    const saveState = vi.fn(async () => {});

    await createClerkE2ESession({
      ...credentials,
      clerkDriver,
      page: new FakeClerkPage(),
      saveState,
    });

    expect(saveState).toHaveBeenCalledOnce();
    expect(clerkDriver.signOutCount).toBe(0);
  });

  it('signs out the session when saving it fails', async () => {
    const clerkDriver = new FakeClerkDriver(false);

    await expect(
      createClerkE2ESession({
        ...credentials,
        clerkDriver,
        page: new FakeClerkPage(),
        saveState: async () => {
          throw new Error('disk full');
        },
      }),
    ).rejects.toThrow('disk full');
    expect(clerkDriver.signOutCount).toBe(1);
    expect(await clerkDriver.hasActiveSession()).toBe(false);
  });

  // The setup project's bounded waits turn a hung Clerk step into this error.
  it('signs out a session that signed in but never confirmed', async () => {
    const clerkDriver = new (class extends FakeClerkDriver {
      override async waitForActiveSession(): Promise<void> {
        throw new Error('timed out waiting for the session');
      }
    })(false);

    await expect(
      createClerkE2ESession({
        ...credentials,
        clerkDriver,
        page: new FakeClerkPage(),
        saveState: async () => {},
      }),
    ).rejects.toThrow('timed out waiting for the session');
    expect(clerkDriver.signOutCount).toBe(1);
  });

  it('keeps the original error when signing out fails too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const clerkDriver = new (class extends FakeClerkDriver {
      override async signOut(): Promise<void> {
        throw new Error('Clerk unavailable');
      }
    })(false);

    await expect(
      createClerkE2ESession({
        ...credentials,
        clerkDriver,
        page: new FakeClerkPage(),
        saveState: async () => {
          throw new Error('disk full');
        },
      }),
    ).rejects.toThrow('disk full');
    expect(warn).toHaveBeenCalledWith(
      'Could not confirm the sign-out after a failed setup attempt; a Clerk E2E session it created stays live until Clerk expires it',
    );
  });
});

describe('releaseClerkE2ESession', () => {
  it('signs out the suite session and waits for invalidation', async () => {
    const page = new FakeClerkPage();
    const clerkDriver = new FakeClerkDriver(true);

    await releaseClerkE2ESession({ clerkDriver, page });

    expect(clerkDriver.signOutCount).toBe(1);
    expect(clerkDriver.waitForSignedOutCount).toBe(1);
  });
});

describe('requireStoredClerkE2ESession', () => {
  it('fails closed instead of creating a replacement session in a test', async () => {
    const page = new FakeClerkPage();
    const clerkDriver = new FakeClerkDriver(false);

    await expect(
      requireStoredClerkE2ESession({ clerkDriver, page }),
    ).rejects.toThrow(
      'Stored Clerk E2E session is unavailable; global setup must create it',
    );
    expect(clerkDriver.signInCount).toBe(0);
  });
});
