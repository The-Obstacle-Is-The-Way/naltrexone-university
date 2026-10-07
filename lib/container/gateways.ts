import { resolveCheckoutDisclosure } from '@/lib/checkout-disclosures';
import {
  ClerkAuthGateway,
  type ClerkUserLookup,
  createResendWebhookVerifier,
  DrizzleRateLimiter,
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
  getSessionClerkUserId: () => Promise<string | null>;
  getClerkUserById: ClerkUserLookup;
}): GatewayFactories {
  const {
    primitives,
    repositories,
    getSessionClerkUserId,
    getClerkUserById,
    stripePriceIds,
  } = input;

  return {
    createAuthGateway: () =>
      new ClerkAuthGateway({
        userRepository: repositories.createUserRepository(),
        deletedClerkUsers: repositories.createDeletedClerkUserRepository(),
        getSessionClerkUserId,
        getClerkUserById,
        logger: primitives.logger,
      }),
    createPaymentGateway: () =>
      new StripePaymentGateway({
        stripe: primitives.getStripe(),
        webhookSecret: primitives.env.STRIPE_WEBHOOK_SECRET,
        consentStateSecret: primitives.env.CONSENT_STATE_SECRET,
        webhookE2EOwner: primitives.env.STRIPE_WEBHOOK_E2E_OWNER,
        priceIds: stripePriceIds,
        logger: primitives.logger,
        resolveCheckoutDisclosure,
        sha256Hasher: primitives.sha256Hasher,
      }),
    createRateLimiter: () =>
      new DrizzleRateLimiter(primitives.db, primitives.now, primitives.logger),
    createSha256Hasher: () => primitives.sha256Hasher,
    createTransactionalEmailGateway: () =>
      new ResendTransactionalEmailGateway({
        apiKey: primitives.env.RESEND_API_KEY,
      }),
    createResendWebhookVerifier: () =>
      createResendWebhookVerifier({
        apiKey: primitives.env.RESEND_API_KEY,
        webhookSecret: primitives.env.RESEND_WEBHOOK_SECRET,
      }),
  };
}
