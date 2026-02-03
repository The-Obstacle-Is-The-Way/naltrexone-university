'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { ROUTES } from '@/lib/routes';
import { CHECKOUT_SESSION_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
import { ApplicationError } from '@/src/application/errors';
import type {
  AuthGateway,
  PaymentGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type {
  IdempotencyKeyRepository,
  StripeCustomerRepository,
  SubscriptionRepository,
} from '@/src/application/ports/repositories';
import { createAction } from './create-action';

const zSubscriptionPlan = z.enum(['monthly', 'annual']);
const zIdempotencyKey = z.string().uuid();

const CreateCheckoutSessionInputSchema = z
  .object({
    plan: zSubscriptionPlan,
    idempotencyKey: zIdempotencyKey.optional(),
  })
  .strict();

const CreatePortalSessionInputSchema = z.object({}).strict();

export type CreateCheckoutSessionOutput = { url: string };
export type CreatePortalSessionOutput = { url: string };

export type BillingControllerDeps = {
  authGateway: AuthGateway;
  stripeCustomerRepository: StripeCustomerRepository;
  subscriptionRepository: SubscriptionRepository;
  paymentGateway: PaymentGateway;
  idempotencyKeyRepository: IdempotencyKeyRepository;
  rateLimiter: RateLimiter;
  getClerkUserId: () => Promise<string | null>;
  appUrl: string;
  now: () => Date;
};

type BillingControllerContainer = {
  createBillingControllerDeps: () => BillingControllerDeps;
};

const getDeps = createDepsResolver<
  BillingControllerDeps,
  BillingControllerContainer
>((container) => container.createBillingControllerDeps(), loadAppContainer);

function toSuccessUrl(appUrl: string): string {
  const base = new URL(ROUTES.CHECKOUT_SUCCESS, appUrl);
  return `${base.toString()}?session_id={CHECKOUT_SESSION_ID}`;
}

function toCancelUrl(appUrl: string): string {
  const url = new URL(ROUTES.PRICING, appUrl);
  url.searchParams.set('checkout', 'cancel');
  return url.toString();
}

function toBillingReturnUrl(appUrl: string): string {
  return new URL(ROUTES.APP_BILLING, appUrl).toString();
}

async function getOrCreateStripeCustomerId(
  deps: BillingControllerDeps,
  input: { userId: string; email: string },
): Promise<string> {
  const existing = await deps.stripeCustomerRepository.findByUserId(
    input.userId,
  );
  if (existing) return existing.stripeCustomerId;

  const clerkUserId = await deps.getClerkUserId();
  if (!clerkUserId) {
    throw new ApplicationError('INTERNAL_ERROR', 'Clerk user id is required');
  }

  const created = await deps.paymentGateway.createCustomer({
    userId: input.userId,
    clerkUserId,
    email: input.email,
    idempotencyKey: `stripe_customer:${input.userId}`,
  });

  await deps.stripeCustomerRepository.insert(
    input.userId,
    created.stripeCustomerId,
  );
  return created.stripeCustomerId;
}

export const createCheckoutSession = createAction({
  schema: CreateCheckoutSessionInputSchema,
  getDeps,
  execute: async (input, d) => {
    const user = await d.authGateway.requireUser();
    const { plan, idempotencyKey } = input;

    async function createNewSession(): Promise<CreateCheckoutSessionOutput> {
      const checkoutRateLimit = await d.rateLimiter.limit({
        key: `billing:createCheckoutSession:${user.id}`,
        ...CHECKOUT_SESSION_RATE_LIMIT,
      });
      if (!checkoutRateLimit.success) {
        throw new ApplicationError(
          'RATE_LIMITED',
          `Too many checkout attempts. Try again in ${checkoutRateLimit.retryAfterSeconds}s.`,
        );
      }

      const subscription = await d.subscriptionRepository.findByUserId(user.id);
      const now = d.now();
      if (subscription && subscription.currentPeriodEnd > now) {
        throw new ApplicationError(
          'ALREADY_SUBSCRIBED',
          'Subscription already exists for this user',
        );
      }

      const stripeCustomerId = await getOrCreateStripeCustomerId(d, {
        userId: user.id,
        email: user.email,
      });

      const checkoutSessionInput = {
        userId: user.id,
        stripeCustomerId,
        plan,
        successUrl: toSuccessUrl(d.appUrl),
        cancelUrl: toCancelUrl(d.appUrl),
      } as const;

      return d.paymentGateway.createCheckoutSession(
        idempotencyKey
          ? { ...checkoutSessionInput, idempotencyKey }
          : checkoutSessionInput,
      );
    }

    if (!idempotencyKey) {
      return createNewSession();
    }

    return withIdempotency({
      repo: d.idempotencyKeyRepository,
      userId: user.id,
      action: 'billing:createCheckoutSession',
      key: idempotencyKey,
      now: d.now,
      execute: createNewSession,
    });
  },
});

export const createPortalSession = createAction({
  schema: CreatePortalSessionInputSchema,
  getDeps,
  execute: async (_input, d) => {
    const user = await d.authGateway.requireUser();

    const stripeCustomer = await d.stripeCustomerRepository.findByUserId(
      user.id,
    );
    if (!stripeCustomer) {
      throw new ApplicationError('NOT_FOUND', 'Stripe customer not found');
    }

    return d.paymentGateway.createPortalSession({
      stripeCustomerId: stripeCustomer.stripeCustomerId,
      returnUrl: toBillingReturnUrl(d.appUrl),
    });
  },
});
