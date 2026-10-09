import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  createClerkE2ESession,
  describeFrontendApiAnswer,
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

  async installTestingToken(): Promise<void> {}

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

  const never = () => new Promise<never>(() => {});

  // Clerk's sign-in and sign-out run page.evaluate, which Playwright never
  // times out, and its route handler retries each request for up to a minute.
  it('signs out when sign-in passes its deadline', async () => {
    const clerkDriver = new (class extends FakeClerkDriver {
      override async signIn(): Promise<void> {
        await super.signIn();
        await never();
      }
    })(false);

    await expect(
      createClerkE2ESession({
        ...credentials,
        clerkDriver,
        deadlines: { signInMs: 10, signOutMs: 1_000 },
        page: new FakeClerkPage(),
        saveState: async () => {},
      }),
    ).rejects.toThrow('Operation timed out after 10ms');
    expect(clerkDriver.signOutCount).toBe(1);
  });

  it('never saves the state of an attempt that passed its deadline', async () => {
    const signedIn = createDeferred<void>();
    const clerkDriver = new (class extends FakeClerkDriver {
      override async signIn(): Promise<void> {
        await signedIn.promise;
        await super.signIn();
      }
    })(false);
    const saveState = vi.fn(async () => {});

    await expect(
      createClerkE2ESession({
        ...credentials,
        clerkDriver,
        deadlines: { signInMs: 10, signOutMs: 1_000 },
        page: new FakeClerkPage(),
        saveState,
      }),
    ).rejects.toThrow('Operation timed out');
    signedIn.resolve();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(saveState).not.toHaveBeenCalled();
  });

  it('never saves the state of a sign-in that finishes during the sign-out', async () => {
    const signedIn = createDeferred<void>();
    let loads = 0;
    const clerkDriver = new (class extends FakeClerkDriver {
      override async load(): Promise<void> {
        loads += 1;
        // The second load is the sign-out's; let the late sign-in finish.
        if (loads === 2) {
          signedIn.resolve();
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      override async signIn(): Promise<void> {
        await signedIn.promise;
        await super.signIn();
      }
    })(false);
    const saveState = vi.fn(async () => {});

    await expect(
      createClerkE2ESession({
        ...credentials,
        clerkDriver,
        deadlines: { signInMs: 10, signOutMs: 1_000 },
        page: new FakeClerkPage(),
        saveState,
      }),
    ).rejects.toThrow('Operation timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(saveState).not.toHaveBeenCalled();
  });

  it('stops waiting for a sign-out that passes its deadline', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const clerkDriver = new (class extends FakeClerkDriver {
      override signOut(): Promise<void> {
        return never();
      }
    })(false);

    await expect(
      createClerkE2ESession({
        ...credentials,
        clerkDriver,
        deadlines: { signInMs: 1_000, signOutMs: 10 },
        page: new FakeClerkPage(),
        saveState: async () => {
          throw new Error('disk full');
        },
      }),
    ).rejects.toThrow('disk full');
    expect(warn).toHaveBeenCalledOnce();
  });

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

  // A bounded Playwright wait inside the sign-in phase throws this.
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

class MemoryRestoreFailures {
  recorded: string | null = null;

  async read(): Promise<string | null> {
    return this.recorded;
  }

  async write(message: string): Promise<void> {
    this.recorded = message;
  }
}

describe('requireStoredClerkE2ESession', () => {
  const describeFailure = async () =>
    'Frontend API: GET /v1/client 401 [authentication_invalid] trace t-1; Clerk status: ready';

  it('restores the stored session without recording anything', async () => {
    const page = new FakeClerkPage();
    const failures = new MemoryRestoreFailures();

    await requireStoredClerkE2ESession({
      clerkDriver: new FakeClerkDriver(true),
      page,
      failures,
      describeFailure,
    });

    expect(page.visitedUrls).toEqual(['/']);
    expect(failures.recorded).toBeNull();
  });

  it('fails closed instead of creating a replacement session in a test', async () => {
    const clerkDriver = new FakeClerkDriver(false);

    await expect(
      requireStoredClerkE2ESession({
        clerkDriver,
        page: new FakeClerkPage(),
        failures: new MemoryRestoreFailures(),
        describeFailure,
      }),
    ).rejects.toThrow(
      'The stored Clerk E2E session could not be restored; every later signed-in test fails with this error',
    );
    expect(clerkDriver.signInCount).toBe(0);
  });

  // BUG-330: one failed restore used to fail every later signed-in test one
  // by one, each with nothing to diagnose it.
  it("names what Clerk's Frontend API answered, and records it for the later tests", async () => {
    const failures = new MemoryRestoreFailures();

    const error = await requireStoredClerkE2ESession({
      clerkDriver: new FakeClerkDriver(false),
      page: new FakeClerkPage(),
      failures,
      describeFailure,
    }).catch((caught: unknown) => caught);

    expect(String(error)).toContain(
      'GET /v1/client 401 [authentication_invalid] trace t-1; Clerk status: ready',
    );
    expect(failures.recorded).toBe((error as Error).message);
  });

  it('fails a later test at once with the recorded error, without loading the page', async () => {
    const failures = new MemoryRestoreFailures();
    failures.recorded = 'The stored Clerk E2E session could not be restored';
    const page = new FakeClerkPage();

    await expect(
      requireStoredClerkE2ESession({
        clerkDriver: new FakeClerkDriver(true),
        page,
        failures,
        describeFailure,
      }),
    ).rejects.toThrow('The stored Clerk E2E session could not be restored');
    expect(page.visitedUrls).toEqual([]);
  });

  // A test project sets no page timeouts, so without its own deadline a hung
  // restore ran to the test timeout, after which Playwright had closed the
  // page and nothing could be read.
  it('records a restore that does not finish within its deadline, with the answers so far', async () => {
    const clerkDriver = new FakeClerkDriver(true);
    clerkDriver.load = () => new Promise<void>(() => {});
    const failures = new MemoryRestoreFailures();

    await expect(
      requireStoredClerkE2ESession({
        clerkDriver,
        page: new FakeClerkPage(),
        failures,
        describeFailure,
        deadlineMs: 50,
      }),
    ).rejects.toThrow('The restore did not finish within 50 ms.');
    expect(failures.recorded).toContain('GET /v1/client 401');
  });

  it('records a restore whose wait for Clerk failed, with that error', async () => {
    const clerkDriver = new FakeClerkDriver(true);
    clerkDriver.load = async () => {
      throw new Error('page.waitForFunction: Timeout 30000ms exceeded.');
    };
    const failures = new MemoryRestoreFailures();

    await expect(
      requireStoredClerkE2ESession({
        clerkDriver,
        page: new FakeClerkPage(),
        failures,
        describeFailure,
      }),
    ).rejects.toThrow('Timeout 30000ms exceeded');
    expect(failures.recorded).toContain('Timeout 30000ms exceeded');
    expect(failures.recorded).toContain('GET /v1/client 401');
  });
});

describe('describeFrontendApiAnswer', () => {
  it('names a refusal by method, path, status, error codes and trace ID', () => {
    expect(
      describeFrontendApiAnswer({
        method: 'GET',
        url: 'https://clerk.example.test/v1/client?__clerk_db_jwt=dvb_secretvalue123&_clerk_js_version=5',
        status: 401,
        body: {
          errors: [
            {
              code: 'authentication_invalid',
              message: 'no',
              long_message: 'x',
            },
          ],
          clerk_trace_id: 'trace-123',
        },
      }),
    ).toBe('GET /v1/client 401 [authentication_invalid] trace trace-123');
  });

  it('never names the query string, which carries the development token', () => {
    const description = describeFrontendApiAnswer({
      method: 'GET',
      url: 'https://clerk.example.test/v1/environment?__clerk_db_jwt=dvb_secretvalue123',
      status: 200,
      body: undefined,
    });

    expect(description).toBe('GET /v1/environment 200');
  });

  it('keeps a refusal whose body is not Clerk-shaped to its status', () => {
    expect(
      describeFrontendApiAnswer({
        method: 'POST',
        url: 'https://clerk.example.test/v1/client/sessions/x/tokens',
        status: 429,
        body: 'Too Many Requests',
      }),
    ).toBe('POST /v1/client/sessions/x/tokens 429');
  });

  it('names Clerk IDs in a path by their kind only, as teardown names statuses only', () => {
    expect(
      describeFrontendApiAnswer({
        method: 'POST',
        url: 'https://clerk.example.test/v1/client/sessions/sess_2abcDEF345ghi/tokens',
        status: 200,
        body: undefined,
      }),
    ).toBe('POST /v1/client/sessions/sess_…/tokens 200');
  });
});

// BUG-330: clerk.loaded() installs no testing-token route; only clerk.signIn()
// does. Clerk's script calls the Frontend API while the page is still
// loading, so the route goes in before the first navigation.
describe('the testing token', () => {
  const describeFailure = async () => 'Frontend API: no answer';

  it.each([
    [
      'restoring the stored session',
      (clerkDriver: FakeClerkDriver, page: FakeClerkPage) =>
        requireStoredClerkE2ESession({
          clerkDriver,
          page,
          failures: new MemoryRestoreFailures(),
          describeFailure,
        }),
    ],
    [
      'creating the session',
      (clerkDriver: FakeClerkDriver, page: FakeClerkPage) =>
        ensureClerkE2ESession({
          clerkDriver,
          page,
          password: 'password',
          username: 'user@example.com',
        }),
    ],
    [
      "releasing a failed attempt's session",
      (clerkDriver: FakeClerkDriver, page: FakeClerkPage) =>
        releaseClerkE2ESession({ clerkDriver, page }),
    ],
  ])('is installed before the first page load when %s', async (_case, run) => {
    const steps: string[] = [];
    const page = new FakeClerkPage();
    page.goto = async (url: string) => {
      steps.push(`goto ${url}`);
    };
    const clerkDriver = new FakeClerkDriver(true);
    clerkDriver.installTestingToken = async () => {
      steps.push('token');
    };

    await run(clerkDriver, page);

    expect(steps[0]).toBe('token');
    expect(steps).toContain('goto /');
  });
});
