'use server';

import { z } from 'zod';
import { createDepsResolver } from '@/lib/controller-helpers';
import { ROUTES } from '@/lib/routes';
import { ApplicationError } from '@/src/application/errors';
import type {
  AuthGateway,
  PaymentGateway,
} from '@/src/application/ports/gateways';
import type {
  StripeCustomerRepository,
  SubscriptionRepository,
} from '@/src/application/ports/repositories';
import { isEntitled } from '@/src/domain/services';
import type { ActionResult } from './action-result';
import { err, handleError, ok } from './action-result';

const zSubscriptionPlan = z.enum(['monthly', 'annual']);

const CreateCheckoutSessionInputSchema = z
  .object({
    plan: zSubscriptionPlan,
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
  getClerkUserId: () => Promise<string | null>;
  appUrl: string;
  now: () => Date;
};

const getDeps = createDepsResolver((container) =>
  container.createBillingControllerDeps(),
);

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
  });

  await deps.stripeCustomerRepository.insert(
    input.userId,
    created.stripeCustomerId,
  );
  return created.stripeCustomerId;
}

export async function createCheckoutSession(
  input: unknown,
  deps?: BillingControllerDeps,
): Promise<ActionResult<CreateCheckoutSessionOutput>> {
  const parsed = CreateCheckoutSessionInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps);
    const user = await d.authGateway.requireUser();

    const subscription = await d.subscriptionRepository.findByUserId(user.id);
    if (isEntitled(subscription, d.now())) {
      throw new ApplicationError(
        'ALREADY_SUBSCRIBED',
        'Subscription already exists for this user',
      );
    }

    const stripeCustomerId = await getOrCreateStripeCustomerId(d, {
      userId: user.id,
      email: user.email,
    });

    const session = await d.paymentGateway.createCheckoutSession({
      userId: user.id,
      stripeCustomerId,
      plan: parsed.data.plan,
      successUrl: toSuccessUrl(d.appUrl),
      cancelUrl: toCancelUrl(d.appUrl),
    });

    return ok(session);
  } catch (error) {
    return handleError(error);
  }
}

export async function createPortalSession(
  input: unknown,
  deps?: BillingControllerDeps,
): Promise<ActionResult<CreatePortalSessionOutput>> {
  const parsed = CreatePortalSessionInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps);
    const user = await d.authGateway.requireUser();

    const stripeCustomer = await d.stripeCustomerRepository.findByUserId(
      user.id,
    );
    if (!stripeCustomer) {
      return err('NOT_FOUND', 'Stripe customer not found');
    }

    const session = await d.paymentGateway.createPortalSession({
      stripeCustomerId: stripeCustomer.stripeCustomerId,
      returnUrl: toBillingReturnUrl(d.appUrl),
    });

    return ok(session);
  } catch (error) {
    return handleError(error);
  }
}
