import {
  ClerkAuthGateway,
  type ClerkUserLike,
  DrizzleRateLimiter,
  StripePaymentGateway,
} from '@/src/adapters/gateways';
import type {
  ContainerPrimitives,
  GatewayFactories,
  RepositoryFactories,
  StripePriceIds,
} from './types';

export function createGatewayFactories(input: {
  primitives: ContainerPrimitives;
  repositories: RepositoryFactories;
  stripePriceIds: StripePriceIds;
  getClerkUser: () => Promise<ClerkUserLike | null>;
}): GatewayFactories {
  const { primitives, repositories, getClerkUser, stripePriceIds } = input;

  return {
    createAuthGateway: () =>
      new ClerkAuthGateway({
        userRepository: repositories.createUserRepository(),
        getClerkUser,
      }),
    createPaymentGateway: () =>
      new StripePaymentGateway({
        stripe: primitives.getStripe(),
        webhookSecret: primitives.env.STRIPE_WEBHOOK_SECRET,
        webhookE2EOwner: primitives.env.STRIPE_WEBHOOK_E2E_OWNER,
        priceIds: stripePriceIds,
        logger: primitives.logger,
      }),
    createRateLimiter: () =>
      new DrizzleRateLimiter(primitives.db, primitives.now, primitives.logger),
  };
}
