import type { Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { waitForActiveClerkSession } from './clerk-auth';

describe('waitForActiveClerkSession', () => {
  it('waits for an active browser session after Clerk sign-in completes', async () => {
    const page = {
      waitForFunction: vi.fn<Page['waitForFunction']>(),
    } satisfies Pick<Page, 'waitForFunction'>;

    await waitForActiveClerkSession(page);

    expect(page.waitForFunction).toHaveBeenCalledOnce();
  });
});
