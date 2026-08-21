import { describe, expect, it, vi } from 'vitest';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';
import {
  buildStripeCompletedCheckoutTriggerArgs,
  STRIPE_CLI_TRIGGER_TIMEOUT_MS,
  triggerStripeCompletedCheckout,
} from './stripe-cli-checkout';

const baseInput = {
  userId: '00000000-0000-4000-8000-000000000471',
  marker: 'debt471-annual-proof',
  email: 'debt471@example.com',
  e2eOwner: 'debt471-owner',
};

describe('buildStripeCompletedCheckoutTriggerArgs', () => {
  it('builds a paid annual subscription trigger using the configured price', () => {
    const args = buildStripeCompletedCheckoutTriggerArgs({
      ...baseInput,
      plan: 'annual',
      priceId: 'price_test_annual',
      amountCents: 19_900,
    });

    expect(args).toContain('checkout.session.completed');
    expect(args).toContain(STRIPE_API_VERSION);
    expect(args).toContain('checkout_session:line_items');
    expect(args[args.indexOf('checkout_session:line_items') - 1]).toBe(
      '--remove',
    );
    expect(args).toContain(
      'checkout_session:line_items[0].price=price_test_annual',
    );
    expect(
      args[
        args.indexOf('checkout_session:line_items[0].price=price_test_annual') -
          1
      ],
    ).toBe('--add');
    expect(args).toContain(
      `checkout_session:subscription_data.metadata.user_id=${baseInput.userId}`,
    );
    expect(args).toContain(
      `checkout_session:client_reference_id=${baseInput.marker}`,
    );
    expect(args).toContain('payment_page_confirm:expected_amount=19900');
    expect(args).toContain('checkout_session:payment_intent_data');
    expect(args).not.toContain(
      'checkout_session:payment_method_collection=if_required',
    );
  });

  it('builds a cardless monthly trial trigger that cancels without a card', () => {
    const args = buildStripeCompletedCheckoutTriggerArgs({
      ...baseInput,
      plan: 'monthly-trial',
      priceId: 'price_test_monthly',
      amountCents: 2_900,
    });

    expect(args).toContain(
      'checkout_session:line_items[0].price=price_test_monthly',
    );
    expect(args).toContain('checkout_session:line_items');
    expect(args).toContain(
      'checkout_session:payment_method_collection=if_required',
    );
    expect(args).toContain(
      'checkout_session:subscription_data.trial_period_days=7',
    );
    expect(args).toContain(
      'checkout_session:subscription_data.trial_settings.end_behavior.missing_payment_method=cancel',
    );
    expect(args).toContain('payment_page_confirm:payment_method');
    expect(args).toContain(
      `payment_page_confirm:customer_data.email=${baseInput.email}`,
    );
    expect(args).toContain('payment_page_confirm:expected_amount=0');
  });
});

describe('triggerStripeCompletedCheckout', () => {
  it('runs the supported trigger with a bounded subprocess and no secret argument', async () => {
    const run = vi.fn().mockResolvedValue(undefined);

    await triggerStripeCompletedCheckout(
      {
        ...baseInput,
        plan: 'annual',
        priceId: 'price_test_annual',
        amountCents: 19_900,
        stripeSecretKey: 'sk_test_cli',
      },
      run,
    );

    expect(run).toHaveBeenCalledOnce();
    const invocation = run.mock.calls[0]?.[0];
    expect(invocation).toMatchObject({
      command: 'pnpm',
      timeoutMs: STRIPE_CLI_TRIGGER_TIMEOUT_MS,
      env: { STRIPE_API_KEY: 'sk_test_cli' },
    });
    expect(invocation?.args).not.toContain('sk_test_cli');
  });

  it('redacts provider identifiers from trigger failures', async () => {
    const run = vi
      .fn()
      .mockRejectedValue(new Error('request req_sensitive for cs_sensitive'));

    await expect(
      triggerStripeCompletedCheckout(
        {
          ...baseInput,
          plan: 'annual',
          priceId: 'price_test_annual',
          amountCents: 19_900,
          stripeSecretKey: 'sk_test_cli',
        },
        run,
      ),
    ).rejects.toThrow('request req_[REDACTED] for cs_[REDACTED]');
  });
});
