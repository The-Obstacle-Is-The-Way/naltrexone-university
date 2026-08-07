import {
  ClerkAuthGateway,
  type ClerkUserLike,
  type ClerkUserLookup,
  DrizzleRateLimiter,
  NobleSha256Hasher,
  ResendTransactionalEmailGateway,
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
  getClerkUserById: ClerkUserLookup;
}): GatewayFactories {
  const {
    primitives,
    repositories,
    getClerkUser,
    getClerkUserById,
    stripePriceIds,
  } = input;

  return {
    createAuthGateway: () =>
      new ClerkAuthGateway({
        userRepository: repositories.createUserRepository(),
        getClerkUser,
        getClerkUserById,
        logger: primitives.logger,
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
    createSha256Hasher: () => new NobleSha256Hasher(),
    createTransactionalEmailGateway: () =>
      new ResendTransactionalEmailGateway({
        apiKey: primitives.env.RESEND_API_KEY,
      }),
  };
}
