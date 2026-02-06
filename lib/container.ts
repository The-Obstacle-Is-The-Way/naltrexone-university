import 'server-only';
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
import { stripe } from './stripe';

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
    stripe,
    now: () => new Date(),
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

  const getClerkUser = async () => {
    if (process.env.NEXT_PUBLIC_SKIP_CLERK === 'true') return null;
    const { currentUser } = await import('@clerk/nextjs/server');
    return currentUser();
  };

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
    getClerkUser,
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
    getClerkUser,
  });
  const controllers = {
    ...controllerFactories,
    ...overrides.controllers,
  } satisfies ControllerFactories;

  return {
    ...primitives,
    primitives,
    ...repositories,
    ...gateways,
    ...useCases,
    ...controllers,
  } as const;
}
