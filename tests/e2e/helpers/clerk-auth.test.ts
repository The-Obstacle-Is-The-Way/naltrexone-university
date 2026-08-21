import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { waitForActiveClerkSession } from './clerk-auth';

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
