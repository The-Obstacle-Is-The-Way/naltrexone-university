import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ManageBillingButton } from './billing-client';

describe('ManageBillingButton (browser)', () => {
  it('shows a disabled processing state while its form action is pending', async () => {
    const portalRedirect = createDeferred<void>();
    const screen = await render(
      <form
        action={async () => {
          await portalRedirect.promise;
        }}
      >
        <ManageBillingButton />
      </form>,
    );

    await screen.getByRole('button', { name: 'Manage in Stripe' }).click();

    await expect
      .element(screen.getByRole('button', { name: 'Processing...' }))
      .toBeDisabled();

    portalRedirect.resolve();

    await expect
      .element(screen.getByRole('button', { name: 'Manage in Stripe' }))
      .toBeEnabled();
  });
});
