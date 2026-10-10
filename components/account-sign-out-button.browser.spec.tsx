import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { AccountSignOutButton } from './account-sign-out-button';

const signOut = vi.hoisted(() => vi.fn(async () => undefined));

// Clerk's SDK cannot be injected into a client component's hook.
vi.mock('@clerk/nextjs', () => ({ useClerk: () => ({ signOut }) }));

describe('AccountSignOutButton (browser)', () => {
  it('signs the person out, then opens the given page', async () => {
    const screen = await render(
      <AccountSignOutButton redirectUrl="/sign-in">
        Sign out
      </AccountSignOutButton>,
    );

    await screen.getByRole('button', { name: 'Sign out' }).click();

    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/sign-in' });
  });
});
