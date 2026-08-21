import type { Page } from '@playwright/test';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const { signIn } = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

vi.mock('@clerk/testing/playwright', () => ({
  clerk: { signIn },
}));

let signInWithClerkPassword: typeof import('./clerk-auth').signInWithClerkPassword;

beforeAll(async () => {
  vi.stubEnv('E2E_CLERK_USER_USERNAME', 'e2e@example.com');
  vi.stubEnv('E2E_CLERK_USER_PASSWORD', 'test-password');
  signInWithClerkPassword = (await import('./clerk-auth'))
    .signInWithClerkPassword;
});

beforeEach(() => {
  signIn.mockReset();
  signIn.mockResolvedValue(undefined);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('signInWithClerkPassword', () => {
  it('waits for an active browser session after Clerk sign-in completes', async () => {
    const page = {
      goto: vi.fn(),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    await signInWithClerkPassword(page);

    expect(page.waitForFunction).toHaveBeenCalledOnce();
    expect(signIn.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(page.waitForFunction).mock.invocationCallOrder[0] ?? 0,
    );
  });
});
