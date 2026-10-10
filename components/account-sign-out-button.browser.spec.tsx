import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { AccountSignOutButton } from '@/components/account-sign-out-button';

const signOut = vi.hoisted(() =>
  vi.fn<(options: { redirectUrl: string }) => Promise<void>>(
    async () => undefined,
  ),
);

// Clerk's SDK cannot be injected into a client component's hook.
vi.mock('@clerk/nextjs', () => ({ useClerk: () => ({ signOut }) }));

const renderButton = () =>
  render(
    <AccountSignOutButton redirectUrl="/sign-in">
      Sign out
    </AccountSignOutButton>,
  );

describe('AccountSignOutButton (browser)', () => {
  it('signs the person out, then opens the given page', async () => {
    const screen = await renderButton();

    await screen.getByRole('button', { name: 'Sign out' }).click();

    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/sign-in' });
  });

  it('shows that it is signing out while Clerk works', async () => {
    signOut.mockImplementationOnce(() => new Promise<void>(() => undefined));
    const screen = await renderButton();

    await screen.getByRole('button', { name: 'Sign out' }).click();

    await expect
      .element(screen.getByRole('button', { name: 'Signing out…' }))
      .toBeDisabled();
  });

  // DEBT-501 item 5: a sign-out that fails must not leave the person on the
  // wrong account with no word.
  it('says so when sign-out fails, and lets the person try again', async () => {
    signOut.mockClear();
    signOut.mockRejectedValueOnce(new Error('network'));
    const screen = await renderButton();

    await screen.getByRole('button', { name: 'Sign out' }).click();

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(
        'Sign-out did not finish. Try again, or use Contact support.',
      );
    await screen.getByRole('button', { name: 'Sign out' }).click();
    expect(signOut).toHaveBeenCalledTimes(2);
  });
});
