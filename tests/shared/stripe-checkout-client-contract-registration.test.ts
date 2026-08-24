import { describe, expect, it } from 'vitest';
import { runStripeCheckoutClientContract } from './stripe-checkout-client-contract';
import { STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES } from './stripe-checkout-client-contract-cases';

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
      ...STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES,
    ]);
  });
});
