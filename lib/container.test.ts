import { describe, expect, it, vi } from 'vitest';
import type { StripeWebhookDeps } from '@/src/adapters/controllers/stripe-webhook-controller';
import {
  ClerkAuthGateway,
  StripePaymentGateway,
} from '@/src/adapters/gateways';
import {
  DrizzleAttemptRepository,
  DrizzleBookmarkRepository,
  DrizzlePracticeSessionRepository,
  DrizzleQuestionRepository,
  DrizzleStripeCustomerRepository,
  DrizzleStripeEventRepository,
  DrizzleSubscriptionRepository,
  DrizzleTagRepository,
} from '@/src/adapters/repositories';
import { DrizzleUserRepository } from '@/src/adapters/repositories/drizzle-user-repository';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import {
  CheckEntitlementUseCase,
  GetNextQuestionUseCase,
  SubmitAnswerUseCase,
} from '@/src/application/use-cases';

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
          NEXT_PUBLIC_APP_URL: 'https://app.example.com',
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
    expect(typeof container.createQuestionControllerDeps).toBe('function');
    expect(typeof container.createQuestionViewControllerDeps).toBe('function');
    expect(typeof container.createBillingControllerDeps).toBe('function');
    expect(typeof container.createBookmarkControllerDeps).toBe('function');
    expect(typeof container.createPracticeControllerDeps).toBe('function');
    expect(typeof container.createReviewControllerDeps).toBe('function');
    expect(typeof container.createStatsControllerDeps).toBe('function');
    expect(typeof container.createTagControllerDeps).toBe('function');
  }, 40000);

  it('wires concrete implementations for all factories', async () => {
    const createContainer = await createContainerPromise;
    const container = createContainer({
      primitives: {
        db: {} as unknown as DrizzleDb,
        env: {
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
          NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
          STRIPE_WEBHOOK_SECRET: 'whsec',
          NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        } as unknown as typeof import('./env').env,
        logger: {
          error: () => undefined,
        } as unknown as typeof import('./logger').logger,
        stripe: {} as unknown as typeof import('./stripe').stripe,
        now: () => new Date('2026-02-01T00:00:00Z'),
      },
    });

    expect(container.createAttemptRepository()).toBeInstanceOf(
      DrizzleAttemptRepository,
    );
    expect(container.createBookmarkRepository()).toBeInstanceOf(
      DrizzleBookmarkRepository,
    );
    expect(container.createPracticeSessionRepository()).toBeInstanceOf(
      DrizzlePracticeSessionRepository,
    );
    expect(container.createQuestionRepository()).toBeInstanceOf(
      DrizzleQuestionRepository,
    );
    expect(container.createTagRepository()).toBeInstanceOf(
      DrizzleTagRepository,
    );
    expect(container.createSubscriptionRepository()).toBeInstanceOf(
      DrizzleSubscriptionRepository,
    );
    expect(container.createStripeCustomerRepository()).toBeInstanceOf(
      DrizzleStripeCustomerRepository,
    );
    expect(container.createStripeEventRepository()).toBeInstanceOf(
      DrizzleStripeEventRepository,
    );
    expect(container.createUserRepository()).toBeInstanceOf(
      DrizzleUserRepository,
    );

    expect(container.createAuthGateway()).toBeInstanceOf(ClerkAuthGateway);
    expect(container.createPaymentGateway()).toBeInstanceOf(
      StripePaymentGateway,
    );

    expect(container.createCheckEntitlementUseCase()).toBeInstanceOf(
      CheckEntitlementUseCase,
    );
    expect(container.createGetNextQuestionUseCase()).toBeInstanceOf(
      GetNextQuestionUseCase,
    );
    expect(container.createSubmitAnswerUseCase()).toBeInstanceOf(
      SubmitAnswerUseCase,
    );

    const deps = container.createStripeWebhookDeps();
    expect(deps.paymentGateway).toBeInstanceOf(StripePaymentGateway);
    expect(typeof deps.transaction).toBe('function');

    const questionDeps = container.createQuestionControllerDeps();
    expect(questionDeps.authGateway).toBeInstanceOf(ClerkAuthGateway);
    expect(questionDeps.checkEntitlementUseCase).toBeInstanceOf(
      CheckEntitlementUseCase,
    );
    expect(questionDeps.getNextQuestionUseCase).toBeInstanceOf(
      GetNextQuestionUseCase,
    );
    expect(questionDeps.submitAnswerUseCase).toBeInstanceOf(
      SubmitAnswerUseCase,
    );

    const questionViewDeps = container.createQuestionViewControllerDeps();
    expect(questionViewDeps.authGateway).toBeInstanceOf(ClerkAuthGateway);
    expect(questionViewDeps.checkEntitlementUseCase).toBeInstanceOf(
      CheckEntitlementUseCase,
    );
    expect(questionViewDeps.questionRepository).toBeInstanceOf(
      DrizzleQuestionRepository,
    );

    const billingDeps = container.createBillingControllerDeps();
    expect(billingDeps.authGateway).toBeInstanceOf(ClerkAuthGateway);
    expect(billingDeps.stripeCustomerRepository).toBeInstanceOf(
      DrizzleStripeCustomerRepository,
    );
    expect(billingDeps.subscriptionRepository).toBeInstanceOf(
      DrizzleSubscriptionRepository,
    );
    expect(billingDeps.paymentGateway).toBeInstanceOf(StripePaymentGateway);
    expect(typeof billingDeps.getClerkUserId).toBe('function');
    expect(billingDeps.appUrl).toBe('https://app.example.com');
    expect(typeof billingDeps.now).toBe('function');

    const bookmarkDeps = container.createBookmarkControllerDeps();
    expect(bookmarkDeps.authGateway).toBeInstanceOf(ClerkAuthGateway);
    expect(bookmarkDeps.checkEntitlementUseCase).toBeInstanceOf(
      CheckEntitlementUseCase,
    );
    expect(bookmarkDeps.bookmarkRepository).toBeInstanceOf(
      DrizzleBookmarkRepository,
    );
    expect(bookmarkDeps.questionRepository).toBeInstanceOf(
      DrizzleQuestionRepository,
    );

    const practiceDeps = container.createPracticeControllerDeps();
    expect(practiceDeps.authGateway).toBeInstanceOf(ClerkAuthGateway);
    expect(practiceDeps.checkEntitlementUseCase).toBeInstanceOf(
      CheckEntitlementUseCase,
    );
    expect(practiceDeps.attemptRepository).toBeInstanceOf(
      DrizzleAttemptRepository,
    );
    expect(practiceDeps.practiceSessionRepository).toBeInstanceOf(
      DrizzlePracticeSessionRepository,
    );
    expect(practiceDeps.questionRepository).toBeInstanceOf(
      DrizzleQuestionRepository,
    );
    expect(typeof practiceDeps.now).toBe('function');

    const reviewDeps = container.createReviewControllerDeps();
    expect(reviewDeps.authGateway).toBeInstanceOf(ClerkAuthGateway);
    expect(reviewDeps.checkEntitlementUseCase).toBeInstanceOf(
      CheckEntitlementUseCase,
    );
    expect(reviewDeps.attemptRepository).toBeInstanceOf(
      DrizzleAttemptRepository,
    );
    expect(reviewDeps.questionRepository).toBeInstanceOf(
      DrizzleQuestionRepository,
    );

    const statsDeps = container.createStatsControllerDeps();
    expect(statsDeps.authGateway).toBeInstanceOf(ClerkAuthGateway);
    expect(statsDeps.checkEntitlementUseCase).toBeInstanceOf(
      CheckEntitlementUseCase,
    );
    expect(statsDeps.attemptRepository).toBeInstanceOf(
      DrizzleAttemptRepository,
    );
    expect(statsDeps.questionRepository).toBeInstanceOf(
      DrizzleQuestionRepository,
    );
    expect(typeof statsDeps.now).toBe('function');

    const tagDeps = container.createTagControllerDeps();
    expect(tagDeps.authGateway).toBeInstanceOf(ClerkAuthGateway);
    expect(tagDeps.checkEntitlementUseCase).toBeInstanceOf(
      CheckEntitlementUseCase,
    );
    expect(tagDeps.tagRepository).toBeInstanceOf(DrizzleTagRepository);
  }, 40000);

  it('shares Stripe price IDs between subscription repository and payment gateway', async () => {
    const createContainer = await createContainerPromise;
    const container = createContainer({
      primitives: {
        db: {} as unknown as DrizzleDb,
        env: {
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
          NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
          STRIPE_WEBHOOK_SECRET: 'whsec',
          NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        } as unknown as typeof import('./env').env,
        logger: {
          error: () => undefined,
        } as unknown as typeof import('./logger').logger,
        stripe: {} as unknown as typeof import('./stripe').stripe,
        now: () => new Date('2026-02-01T00:00:00Z'),
      },
    });

    const paymentGateway = container.createPaymentGateway();
    const subscriptionRepository = container.createSubscriptionRepository();

    expect(
      (paymentGateway as unknown as { deps: { priceIds: unknown } }).deps
        .priceIds,
    ).toBe(
      (subscriptionRepository as unknown as { priceIds: unknown }).priceIds,
    );
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
      pruneProcessedBefore: async () => 0,
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
      createCustomer: async () => ({ stripeCustomerId: 'cus_123' }),
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
          NEXT_PUBLIC_APP_URL: 'https://app.example.com',
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
