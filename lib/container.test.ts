import { describe, expect, it, vi } from 'vitest';
import type { StripeWebhookDeps } from '@/src/adapters/controllers/stripe-webhook-controller';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';

vi.mock('server-only', () => ({}));
vi.mock('stripe', () => ({
  default: class StripeMock {},
}));

process.env.DATABASE_URL ??=
  'postgresql://user:pass@localhost:5432/addiction_boards_test';
process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy';
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= 'pk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_dummy';
process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY ??= 'price_dummy_monthly';
process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL ??= 'price_dummy_annual';
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
process.env.NEXT_PUBLIC_SKIP_CLERK ??= 'true';

async function loadContainer() {
  const mod = await import('./container');
  return mod.createContainer;
}

const createContainerPromise = loadContainer();

describe('container factories', () => {
  it('exposes factory functions for repositories, use cases, and controllers', async () => {
    const createContainer = await createContainerPromise;
    const container = createContainer({
      primitives: {
        db: {} as unknown as DrizzleDb,
        env: {
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
          NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
          STRIPE_WEBHOOK_SECRET: 'whsec',
        } as unknown as typeof import('./env').env,
        logger: {
          error: () => undefined,
        } as unknown as typeof import('./logger').logger,
        stripe: {} as unknown as typeof import('./stripe').stripe,
        now: () => new Date('2026-02-01T00:00:00Z'),
      },
    });

    expect(typeof container.createAttemptRepository).toBe('function');
    expect(typeof container.createBookmarkRepository).toBe('function');
    expect(typeof container.createPracticeSessionRepository).toBe('function');
    expect(typeof container.createQuestionRepository).toBe('function');
    expect(typeof container.createTagRepository).toBe('function');
    expect(typeof container.createSubscriptionRepository).toBe('function');
    expect(typeof container.createStripeCustomerRepository).toBe('function');
    expect(typeof container.createStripeEventRepository).toBe('function');
    expect(typeof container.createUserRepository).toBe('function');

    expect(typeof container.createAuthGateway).toBe('function');
    expect(typeof container.createPaymentGateway).toBe('function');

    expect(typeof container.createCheckEntitlementUseCase).toBe('function');
    expect(typeof container.createGetNextQuestionUseCase).toBe('function');
    expect(typeof container.createSubmitAnswerUseCase).toBe('function');

    expect(typeof container.createStripeWebhookDeps).toBe('function');
  }, 40000);

  it('uses repository factories inside createStripeWebhookDeps transactions', async () => {
    const createContainer = await createContainerPromise;
    const tx = { tx: true } as const;
    const transaction = vi.fn(
      async <T>(fn: (db: unknown) => Promise<T>): Promise<T> => fn(tx),
    );

    const createStripeEventRepository = vi.fn(() => ({
      claim: async () => true,
      lock: async () => ({ processedAt: null, error: null }),
      markProcessed: async () => undefined,
      markFailed: async () => undefined,
    }));
    const createSubscriptionRepository = vi.fn(() => ({
      findByUserId: async () => null,
      findByStripeSubscriptionId: async () => null,
      upsert: async () => undefined,
    }));
    const createStripeCustomerRepository = vi.fn(() => ({
      findByUserId: async () => null,
      insert: async () => undefined,
    }));

    const paymentGateway = {
      createCheckoutSession: async () => ({ url: 'https://stripe/checkout' }),
      createPortalSession: async () => ({ url: 'https://stripe/portal' }),
      processWebhookEvent: async () => ({ eventId: 'evt_1', type: 'test' }),
    };

    const container = createContainer({
      primitives: {
        db: { transaction } as unknown as DrizzleDb,
        env: {
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
          NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
          STRIPE_WEBHOOK_SECRET: 'whsec',
        } as unknown as typeof import('./env').env,
        logger: {
          error: () => undefined,
        } as unknown as typeof import('./logger').logger,
        stripe: {} as unknown as typeof import('./stripe').stripe,
        now: () => new Date('2026-02-01T00:00:00Z'),
      },
      repositories: {
        createStripeEventRepository,
        createSubscriptionRepository,
        createStripeCustomerRepository,
      },
      gateways: {
        createPaymentGateway: () => paymentGateway,
      },
    });

    const deps: StripeWebhookDeps = container.createStripeWebhookDeps();

    await deps.transaction(async (repoDeps) => {
      expect(repoDeps.stripeEvents).toBe(
        createStripeEventRepository.mock.results[0]?.value,
      );
      expect(repoDeps.subscriptions).toBe(
        createSubscriptionRepository.mock.results[0]?.value,
      );
      expect(repoDeps.stripeCustomers).toBe(
        createStripeCustomerRepository.mock.results[0]?.value,
      );
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(createStripeEventRepository).toHaveBeenCalledWith(tx);
    expect(createSubscriptionRepository).toHaveBeenCalledWith(tx);
    expect(createStripeCustomerRepository).toHaveBeenCalledWith(tx);
  }, 40000);
});
