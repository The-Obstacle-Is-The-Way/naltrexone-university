import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PlanConsentDialog } from '@/app/pricing/plan-consent-dialog';
import { PricingView } from '@/app/pricing/pricing-view';
import { PRICING_DATA } from '@/lib/pricing-data';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

for (const plan of ['monthly', 'annual'] as const) {
  for (const hasTrial of [true, false]) {
    test(`opens ${plan} ${hasTrial ? 'trial' : 'standard'} consent and returns focus on Escape`, async () => {
      const screen = await render(
        <PlanConsentDialog
          plan={plan}
          hasTrial={hasTrial}
          subscribeAction={async () => undefined}
        />,
      );
      const label = hasTrial
        ? 'Start 7-day free trial'
        : plan === 'monthly'
          ? 'Subscribe Monthly'
          : 'Subscribe Annual';
      const trigger = screen.getByRole('button', { name: label, exact: true });
      await trigger.click();
      const dialog = screen.getByRole('dialog');
      await expect.element(dialog).toBeVisible();
      await expect
        .element(
          dialog.getByRole('heading', {
            name: hasTrial
              ? 'Start your 7-day free trial'
              : `Subscribe to ${PRICING_DATA[plan].name}`,
          }),
        )
        .toBeVisible();
      await expect.element(dialog.getByRole('heading')).toHaveFocus();
      await expect
        .element(dialog.getByRole('heading'))
        .toHaveClass('ring-focus');
      const consent =
        PRICING_DATA[plan].consent[hasTrial ? 'trial' : 'standard'];
      for (const row of consent.rows) {
        await expect
          .element(dialog.getByText(`${row.label}:`, { exact: true }))
          .toBeVisible();
        await expect
          .element(dialog.getByText(row.value, { exact: true }))
          .toBeVisible();
      }
      await expect
        .element(dialog.getByText(consent.sentence, { exact: true }))
        .toBeVisible();
      await userEvent.keyboard('{Escape}');
      await expect.element(dialog).not.toBeInTheDocument();
      await expect.element(trigger).toHaveFocus();
    });
  }
}

test('submits the displayed offer and a fresh idempotency key after reopening a posted form', async () => {
  const submit = vi.fn(async (_formData: FormData) => undefined);
  const screen = await render(
    <PlanConsentDialog
      plan="annual"
      hasTrial={false}
      subscribeAction={submit}
    />,
  );
  const trigger = screen.getByRole('button', {
    name: 'Subscribe Annual',
    exact: true,
  });
  await trigger.click();
  await screen
    .getByRole('dialog')
    .getByRole('button', { name: 'Subscribe', exact: true })
    .click();
  await expect.poll(() => submit.mock.calls.length).toBe(1);
  const first = submit.mock.calls[0]?.[0];
  expect(first?.get('idempotencyKey')).toMatch(/^[0-9a-f-]{36}$/);
  expect(first?.get('disclosureVersion')).toBe('2026-09-16');
  expect(first?.get('hasTrial')).toBe('false');
  await userEvent.keyboard('{Escape}');
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  await trigger.click();
  await screen
    .getByRole('dialog')
    .getByRole('button', { name: 'Subscribe', exact: true })
    .click();
  await expect.poll(() => submit.mock.calls.length).toBe(2);
  expect(submit.mock.calls[1]?.[0].get('idempotencyKey')).not.toBe(
    first?.get('idempotencyKey'),
  );
});

test('disables the commit button while the checkout request is pending', async () => {
  const pending = createDeferred<void>();
  const screen = await render(
    <PlanConsentDialog
      plan="monthly"
      hasTrial
      subscribeAction={() => pending.promise}
    />,
  );
  await screen.getByRole('button', { name: 'Start 7-day free trial' }).click();
  try {
    await screen
      .getByRole('dialog')
      .getByRole('button', { name: 'Start free trial', exact: true })
      .click();
    await expect
      .element(screen.getByRole('button', { name: 'Processing...' }))
      .toBeDisabled();
  } finally {
    pending.resolve();
    await pending.promise;
  }
});

for (const selectedPlan of ['monthly', 'annual'] as const) {
  test(`auto-opens only the authenticated ${selectedPlan} query offer without submitting`, async () => {
    const submit = vi.fn(async (_data: FormData) => undefined);
    const screen = await render(
      <PricingView
        isAuthenticated
        isEntitled={false}
        banner={null}
        selectedPlan={selectedPlan}
        showTrialCtas
        subscribeMonthlyAction={submit}
        subscribeAnnualAction={submit}
      />,
    );
    const dialog = screen.getByRole('dialog');
    await expect.element(dialog).toBeVisible();
    await expect
      .element(
        dialog.getByText(PRICING_DATA[selectedPlan].name, { exact: true }),
      )
      .toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });
}

test('opens standard terms for a returning subscriber with a selected plan', async () => {
  const screen = await render(
    <PricingView
      isAuthenticated
      isEntitled={false}
      banner={null}
      selectedPlan="annual"
      showTrialCtas={false}
      subscribeMonthlyAction={async () => undefined}
      subscribeAnnualAction={async () => undefined}
    />,
  );
  await expect
    .element(
      screen
        .getByRole('dialog')
        .getByRole('heading', { name: 'Subscribe to Pro Annual' }),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole('dialog').getByText('Trial:', { exact: true }))
    .not.toBeInTheDocument();
});

test('keeps selected-plan signup links for anonymous visitors without opening consent', async () => {
  const screen = await render(
    <PricingView
      isAuthenticated={false}
      isEntitled={false}
      banner={null}
      selectedPlan="monthly"
      showTrialCtas
      subscribeMonthlyAction={async () => undefined}
      subscribeAnnualAction={async () => undefined}
    />,
  );
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  await expect
    .element(
      screen.getByRole('link', { name: 'Start 7-day free trial' }).first(),
    )
    .toHaveAttribute(
      'href',
      '/sign-up?redirect_url=%2Fpricing%3Fplan%3Dmonthly',
    );
});

test('keeps authenticated dialogs closed without a valid selected plan', async () => {
  const screen = await render(
    <PricingView
      isAuthenticated
      isEntitled={false}
      banner={null}
      selectedPlan={null}
      showTrialCtas
      subscribeMonthlyAction={async () => undefined}
      subscribeAnnualAction={async () => undefined}
    />,
  );

  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  await expect
    .element(
      screen.getByRole('button', { name: 'Start 7-day free trial' }).first(),
    )
    .toBeVisible();
});

for (const state of ['subscribed', 'needs attention'] as const) {
  test(`shows no consent dialog or trial footnote for a ${state} account with a selected plan`, async () => {
    const screen = await render(
      <PricingView
        isAuthenticated
        isEntitled={state === 'subscribed'}
        banner={null}
        selectedPlan="annual"
        showTrialCtas={false}
        {...(state === 'needs attention'
          ? { manageBillingAction: async () => undefined }
          : {})}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
    await expect
      .element(
        screen.getByText('7-day free trial on either plan.', { exact: false }),
      )
      .not.toBeInTheDocument();
    await expect
      .element(
        screen.getByText(
          state === 'subscribed'
            ? "You're already subscribed"
            : 'Subscription needs attention',
        ),
      )
      .toBeVisible();
  });
}
