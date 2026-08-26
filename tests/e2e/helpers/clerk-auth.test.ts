import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
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
