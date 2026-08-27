import { describe, expect, it } from 'vitest';
import { pollStripeProviderState } from './stripe-provider-state-poll';

describe('pollStripeProviderState', () => {
  it('accepts a provider transition that finishes after the legacy wait budget', async () => {
    let nowMs = 0;

    const result = await pollStripeProviderState(
      {
        description: 'Stripe test clock did not become ready',
        describeValue: (clock) => `clock status ${clock.status}`,
        fetch: async () => ({
          status: nowMs > 8_500 ? 'ready' : 'advancing',
        }),
        isDone: (clock) => clock.status === 'ready',
      },
      {
        now: () => nowMs,
        sleep: async (delayMs) => {
          nowMs += delayMs;
        },
      },
    );

    expect(result.status).toBe('ready');
    expect(nowMs).toBeGreaterThan(8_500);
  });

  it('fails with the last provider state when the bounded wait expires', async () => {
    let nowMs = 0;

    await expect(
      pollStripeProviderState(
        {
          description: 'Stripe test clock did not become ready',
          describeValue: (clock) => `clock status ${clock.status}`,
          fetch: async () => ({ status: 'advancing' }),
          isDone: (clock) => clock.status === 'ready',
        },
        {
          now: () => nowMs,
          sleep: async (delayMs) => {
            nowMs += delayMs;
          },
        },
      ),
    ).rejects.toThrow(
      'Stripe test clock did not become ready timed out after 15000ms (budget 15000ms); last observed clock status advancing',
    );
  });

  it('uses the system wait runtime when no fake runtime is supplied', async () => {
    let fetchCount = 0;

    const result = await pollStripeProviderState({
      description: 'Stripe test clock did not become ready',
      describeValue: (clock) => `clock status ${clock.status}`,
      fetch: async () => ({
        status: fetchCount++ === 0 ? 'advancing' : 'ready',
      }),
      isDone: (clock) => clock.status === 'ready',
    });

    expect(result.status).toBe('ready');
    expect(fetchCount).toBe(2);
  });
});
