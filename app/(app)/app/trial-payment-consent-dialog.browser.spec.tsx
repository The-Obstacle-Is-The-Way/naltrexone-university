import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import {
  PRICING_DATA,
  TRIAL_PAYMENT_DISCLOSURE_VERSION,
} from '@/lib/pricing-data';
import { TrialPaymentConsentDialog } from './trial-payment-consent-dialog';

// DEBT-414 F03b: the trial add-card offer uses the same consent dialog as
// checkout, with its own separate renewal opt-in.
test.each(['monthly', 'annual'] as const)(
  'shows the %s add-card terms and opt-in before Stripe',
  async (plan) => {
    const screen = await render(
      <TrialPaymentConsentDialog
        plan={plan}
        createTrialPaymentMethodActionFn={vi.fn(async () => undefined)}
      />,
    );

    await screen
      .getByRole('button', { name: 'Add a card to keep access' })
      .click();

    const dialog = screen.getByRole('dialog');
    await expect.element(dialog).toBeVisible();
    for (const { value } of PRICING_DATA[plan].trialPaymentConsent.rows) {
      await expect
        .element(dialog.getByText(value, { exact: true }))
        .toBeVisible();
    }
    await expect
      .element(
        dialog.getByRole('checkbox', {
          name: PRICING_DATA[plan].trialPaymentConsent.optIn,
        }),
      )
      .not.toBeChecked();
  },
);

test('does not open Stripe until the renewal opt-in is checked, then posts the displayed terms', async () => {
  const submit = vi.fn(async (_formData: FormData) => undefined);
  const screen = await render(
    <TrialPaymentConsentDialog
      plan="monthly"
      createTrialPaymentMethodActionFn={submit}
    />,
  );
  await screen
    .getByRole('button', { name: 'Add a card to keep access' })
    .click();
  const dialog = screen.getByRole('dialog');
  const optIn = dialog.getByRole('checkbox');

  await dialog.getByRole('button', { name: 'Add a card', exact: true }).click();

  expect((optIn.element() as HTMLInputElement).validity.valueMissing).toBe(
    true,
  );
  expect(submit).not.toHaveBeenCalled();
  await optIn.click();
  await dialog.getByRole('button', { name: 'Add a card', exact: true }).click();
  await expect.poll(() => submit.mock.calls.length).toBe(1);
  const posted = submit.mock.calls[0]?.[0];
  expect(posted?.get('renewalOptIn')).toBe('yes');
  expect(posted?.get('disclosureVersion')).toBe(
    TRIAL_PAYMENT_DISCLOSURE_VERSION,
  );
  expect(posted?.get('idempotencyKey')).toMatch(/^[0-9a-f-]{36}$/);
});
