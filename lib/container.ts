import { StripeCallBudget } from '@/src/adapters/gateways/stripe/stripe-call-budget';
import {
  type StripeRequestClient,
  stripeRequestClient,
} from '@/src/adapters/gateways/stripe/stripe-request-client';
import 'server-only';
import { NobleSha256Hasher } from '@/src/adapters/gateways';
import { alertWhenClerkRefuses } from '@/src/adapters/gateways/clerk-refusal-alert';
import { createControllerFactories } from './container/controllers';
import { createGatewayFactories } from './container/gateways';
import { createRepositoryFactories } from './container/repositories';
import type {
  ContainerOverrides,
  ContainerPrimitives,
  ControllerFactories,
  GatewayFactories,
  RepositoryFactories,
  UseCaseFactories,
} from './container/types';
import { createUseCaseFactories } from './container/use-cases';
import { db } from './db';
import { env } from './env';
import { logger } from './logger';
import { getStripe } from './stripe';
import { createStripeClient } from './stripe-client';

export type {
  ContainerOverrides,
  ContainerPrimitives,
  ControllerFactories,
  GatewayFactories,
  RepositoryFactories,
  UseCaseFactories,
} from './container/types';

/**
 * Composition root primitives.
 *
 * As we build out `src/application/**` and `src/adapters/**`, this file will grow
 * factory functions that wire ports -> concrete implementations.
 */
export function createContainerPrimitives(
  overrides: Partial<ContainerPrimitives> = {},
) {
  const primitives = {
    db,
    env,
    logger,
    getStripe,
    stripeBudget: undefined,
    now: () => new Date(),
    sha256Hasher: new NobleSha256Hasher(),
    ...overrides,
  } as const;

  return {
    ...primitives,
    logger: primitives.logger ?? console,
  } as const;
}

export function createContainer(overrides: ContainerOverrides = {}) {
  const primitives = createContainerPrimitives(overrides.primitives);
  const stripePriceIds = {
    monthly: primitives.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
    annual: primitives.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
  };

  // DEBT-503 item 1: the Clerk user ID of the session the middleware verified.
  // auth() reads it from the request, with no Backend API call; Clerk's
  // Backend API is reached only through getClerkUserById.
  const getSessionClerkUserId = async () => {
    if (process.env.NEXT_PUBLIC_SKIP_CLERK === 'true') return null;
    const { auth } = await import('@clerk/nextjs/server');
    return (await auth()).userId ?? null;
  };

  // DEBT-503 item 3: Clerk answering 429 alerts the owner. The alerts come
  // from the finished gateways, built below, when a refusal first occurs.
  const getClerkUserById = alertWhenClerkRefuses(
    async (clerkUserId: string) => {
      if (process.env.NEXT_PUBLIC_SKIP_CLERK === 'true') return null;
      const { clerkClient } = await import('@clerk/nextjs/server');
      const client = await clerkClient();
      return client.users.getUser(clerkUserId);
    },
    {
      alerts: () => gateways.createOperationalAlerts(),
      logger: primitives.logger,
    },
  );

  const repositoryFactories = createRepositoryFactories(
    primitives,
    stripePriceIds,
  );
  const repositories = {
    ...repositoryFactories,
    ...overrides.repositories,
  } satisfies RepositoryFactories;

  const gatewayFactories = createGatewayFactories({
    primitives,
    repositories,
    stripePriceIds,
    getSessionClerkUserId,
    getClerkUserById,
  });
  const gateways = {
    ...gatewayFactories,
    ...overrides.gateways,
  } satisfies GatewayFactories;

  const useCaseFactories = createUseCaseFactories({
    primitives,
    repositories,
    gateways,
  });
  const useCases = {
    ...useCaseFactories,
    ...overrides.useCases,
  } satisfies UseCaseFactories;

  const controllerFactories = createControllerFactories({
    primitives,
    repositories,
    gateways,
    useCases,
    getSessionClerkUserId,
  });
  const controllers = {
    ...controllerFactories,
    ...overrides.controllers,
  } satisfies ControllerFactories;

  return {
    ...primitives,
    getClerkUserById,
    get stripe() {
      return primitives.getStripe();
    },
    primitives,
    ...repositories,
    ...gateways,
    ...useCases,
    ...controllers,
  } as const;
}

/** A fresh deadline and client per HTTP request; cron keeps its own policy. */
export function createRequestContainer(overrides: ContainerOverrides = {}) {
  const stripeBudget =
    overrides.primitives?.stripeBudget ?? new StripeCallBudget();
  const makeStripe =
    overrides.primitives?.getStripe ??
    (() =>
      createStripeClient(
        (overrides.primitives?.env ?? env).STRIPE_SECRET_KEY,
        {},
        undefined,
        stripeBudget,
      ));
  let stripe: StripeRequestClient | undefined;
  return createContainer({
    ...overrides,
    primitives: {
      ...overrides.primitives,
      stripeBudget,
      getStripe: () => (stripe ??= stripeRequestClient(makeStripe())),
    },
  });
}
