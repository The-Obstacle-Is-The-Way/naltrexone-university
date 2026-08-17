import { describe, expect, it, vi } from 'vitest';
import { SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT } from '@/src/adapters/gateways/stripe/stripe-checkout-sessions';
import {
  assertLocalTrialCheckoutReplayCapacity,
  type LocalTrialCheckoutReplayCapacityServices,
} from './trial-checkout-replay-capacity';

const NOW_MS = Date.UTC(2026, 7, 17, 12, 0, 0);
const appUserId = crypto.randomUUID();
const stripeCustomerId = 'cus_capacity_fixture';

type CheckoutSessionFixture = Awaited<
  ReturnType<
    LocalTrialCheckoutReplayCapacityServices['listRecentCheckoutSessions']
  >
>[number];

function createEnv(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL:
      'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
    E2E_CLERK_USER_USERNAME: 'e2e-test@example.com',
    STRIPE_SECRET_KEY: 'sk_test_capacity_fixture',
    ...overrides,
  };
}

function createSession(
  overrides: Partial<CheckoutSessionFixture> = {},
): CheckoutSessionFixture {
  return {
    created: Math.floor((NOW_MS - 60_000) / 1000),
    mode: 'subscription',
    status: 'complete',
    metadata: {
      renewal_user_id: appUserId,
      renewal_plan: 'monthly',
      checkout_variant: 'trial:7',
    },
    ...overrides,
  };
}

function createServices(
  sessions: CheckoutSessionFixture[] = [],
  overrides: Partial<LocalTrialCheckoutReplayCapacityServices> = {},
): LocalTrialCheckoutReplayCapacityServices {
  return {
    resolveBillingState: vi.fn(async () => ({
      userId: appUserId,
      stripeCustomerId,
    })),
    listRecentCheckoutSessions: vi.fn(async () => sessions),
    ...overrides,
  };
}

describe('assertLocalTrialCheckoutReplayCapacity', () => {
  it('allows a local trial checkout when retained terminal sessions are at the cap', async () => {
    const services = createServices(
      Array.from({ length: SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT }, () =>
        createSession(),
      ),
    );

    await expect(
      assertLocalTrialCheckoutReplayCapacity({
        env: createEnv(),
        nowMs: () => NOW_MS,
        services,
      }),
    ).resolves.toBeUndefined();
  });

  it('fails loudly with a count-only receipt when retained terminal sessions exceed the cap', async () => {
    const sessions = Array.from(
      { length: SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT + 1 },
      () => createSession(),
    );
    const services = createServices(sessions);

    const action = assertLocalTrialCheckoutReplayCapacity({
      env: createEnv(),
      nowMs: () => NOW_MS,
      services,
    });

    await expect(action).rejects.toThrow('[E2E_CHECKOUT_CHAIN_SATURATED]');
    await expect(action).rejects.toThrow(
      `${SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT + 1} terminal trial Checkout Sessions (${SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT + 1} complete, 0 expired) created less than 24 hours ago exceed traversal cap ${SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT}`,
    );
    await expect(action).rejects.not.toThrow(appUserId);
    await expect(action).rejects.not.toThrow(stripeCustomerId);
    await expect(action).rejects.not.toThrow('sk_test_capacity_fixture');
  });

  it('counts only current-user monthly trial terminal sessions younger than 24 hours', async () => {
    const exactlyTwentyFourHoursOld = Math.floor(
      (NOW_MS - 24 * 60 * 60 * 1000) / 1000,
    );
    // Exactly the cap's worth of countable sessions, so counting even one of
    // the ignored sessions below would cross the boundary and reject.
    const countableAtCap = [
      ...Array.from(
        { length: SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT - 1 },
        () => createSession(),
      ),
      createSession({ status: 'expired' }),
    ];
    const sessions = [
      ...countableAtCap,
      createSession({ status: 'open' }),
      createSession({ mode: 'setup' }),
      createSession({ created: exactlyTwentyFourHoursOld }),
      createSession({
        metadata: {
          renewal_user_id: crypto.randomUUID(),
          renewal_plan: 'monthly',
          checkout_variant: 'trial:7',
        },
      }),
      createSession({
        metadata: {
          renewal_user_id: appUserId,
          renewal_plan: 'annual',
          checkout_variant: 'trial:7',
        },
      }),
      createSession({
        metadata: {
          renewal_user_id: appUserId,
          renewal_plan: 'monthly',
          checkout_variant: 'standard',
        },
      }),
    ];
    const services = createServices(sessions);

    await expect(
      assertLocalTrialCheckoutReplayCapacity({
        env: createEnv(),
        nowMs: () => NOW_MS,
        services,
      }),
    ).resolves.toBeUndefined();
  });

  it('does not probe a truthy CI environment because each job gets a fresh app-user UUID', async () => {
    const services = createServices();

    await expect(
      assertLocalTrialCheckoutReplayCapacity({
        env: createEnv({ CI: '1' }),
        nowMs: () => NOW_MS,
        services,
      }),
    ).resolves.toBeUndefined();

    expect(services.resolveBillingState).not.toHaveBeenCalled();
    expect(services.listRecentCheckoutSessions).not.toHaveBeenCalled();
  });

  it('redacts provider diagnostics when the read-only census fails', async () => {
    const sensitiveError = new Error(
      `[E2E_CHECKOUT_CHAIN_SATURATED] request req_sensitive failed for ${stripeCustomerId} with sk_test_capacity_fixture`,
    );
    const services = createServices([], {
      listRecentCheckoutSessions: vi.fn(async () => {
        throw sensitiveError;
      }),
    });

    const action = assertLocalTrialCheckoutReplayCapacity({
      env: createEnv(),
      nowMs: () => NOW_MS,
      services,
    });

    await expect(action).rejects.toThrow('[E2E_CHECKOUT_CHAIN_PROBE_FAILED]');
    await expect(action).rejects.not.toThrow('req_sensitive');
    await expect(action).rejects.not.toThrow(stripeCustomerId);
    await expect(action).rejects.not.toThrow('sk_test_capacity_fixture');
  });
});
