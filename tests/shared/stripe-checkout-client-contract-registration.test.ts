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
      "lists a customer's Subscriptions by id and status and retrieves them by id",
      'cancels a Subscription once and rejects a repeat cancel as resource_missing',
      'finds Customers by whole, case-insensitive metadata value through Search once indexed',
    ]);
  });

  it('gives only the Search case a budget beyond Stripe indexing', () => {
    const budgets: Array<number | undefined> = [];

    runStripeCheckoutClientContract(
      'registration probe',
      async () => {
        throw new Error('Registration must not create a harness');
      },
      (_name, registerCases) => registerCases(),
      (_name, _run, timeoutMs) => {
        budgets.push(timeoutMs);
      },
    );

    expect(budgets).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      120_000,
    ]);
  });
});
