import { describe, expect, it } from 'vitest';
import { runStripeCheckoutClientContract } from './stripe-checkout-client-contract';

describe('Stripe Checkout client contract registration', () => {
  it('registers reporter-stable literal case names', () => {
    const registeredNames: string[] = [];

    runStripeCheckoutClientContract(
      'registration probe',
      async () => {
        throw new Error('Registration must not create a harness');
      },
      (_name, registerCases) => registerCases(),
      (name) => {
        registeredNames.push(name);
      },
    );

    expect(registeredNames).toEqual([
      'replays a frozen create response while retrieve exposes terminal live state',
      'lists Sessions in reverse chronology with starting_after and has_more',
      'keeps terminal Sessions visible in unfiltered listings',
      'rejects an idempotency key reused with different parameters',
    ]);
  });
});
