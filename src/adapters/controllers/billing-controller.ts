'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { ROUTES } from '@/lib/routes';
import {
  CHECKOUT_SESSION_RATE_LIMIT,
  PORTAL_SESSION_RATE_LIMIT,
} from '@/src/adapters/shared/rate-limits';
import { zUuid } from '@/src/adapters/shared/zod-schemas';
import { ApplicationError } from '@/src/application/errors';
import type {
  AuthGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type { IdempotencyKeyRepository } from '@/src/application/ports/repositories';
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionOutput,
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
} from '@/src/application/use-cases';
import { createAction } from './create-action';
import { executeIdempotent } from './shared/execute-idempotent';

const zSubscriptionPlan = z.enum(['monthly', 'annual']);
const zIdempotencyKey = zUuid;

const CreateCheckoutSessionInputSchema = z
  .object({
    plan: zSubscriptionPlan,
    idempotencyKey: zIdempotencyKey.optional(),
  })
  .strict();

const CreatePortalSessionInputSchema = z
  .object({
    idempotencyKey: zIdempotencyKey.optional(),
  })
  .strict();

const CreateCheckoutSessionOutputSchema = z
  .object({
    url: z.string().min(1),
  })
  .strict();

const CreatePortalSessionOutputSchema = z
  .object({
    url: z.string().min(1),
  })
  .strict();

export type {
  CreateCheckoutSessionOutput,
  CreatePortalSessionOutput,
} from '@/src/application/use-cases';

export type BillingControllerDeps = {
  authGateway: AuthGateway;
  logger: Logger;
  createCheckoutSessionUseCase: {
    execute: (
      input: CreateCheckoutSessionInput,
    ) => Promise<CreateCheckoutSessionOutput>;
  };
  createPortalSessionUseCase: {
    execute: (
      input: CreatePortalSessionInput,
    ) => Promise<CreatePortalSessionOutput>;
  };
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

export const createCheckoutSession = createAction({
  schema: CreateCheckoutSessionInputSchema,
  getDeps,
  execute: async (input, d) => {
    const user = await d.authGateway.requireUser();
    const { plan, idempotencyKey } = input;

    async function createNewSession(): Promise<CreateCheckoutSessionOutput> {
      const checkoutSessionInput = {
        userId: user.id,
        clerkUserId: await d.getClerkUserId(),
        email: user.email,
        plan,
        successUrl: toSuccessUrl(d.appUrl),
        cancelUrl: toCancelUrl(d.appUrl),
      } as const;

      return d.createCheckoutSessionUseCase.execute(
        idempotencyKey
          ? { ...checkoutSessionInput, idempotencyKey }
          : checkoutSessionInput,
      );
    }

    async function enforceCheckoutRateLimit(): Promise<void> {
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
    }

    return executeIdempotent({
      d,
      userId: user.id,
      action: 'billing:createCheckoutSession',
      idempotencyKey,
      outputSchema: CreateCheckoutSessionOutputSchema,
      beforeExecute: enforceCheckoutRateLimit,
      execute: createNewSession,
    });
  },
});

export const createPortalSession = createAction({
  schema: CreatePortalSessionInputSchema,
  getDeps,
  execute: async (input, d) => {
    const user = await d.authGateway.requireUser();
    const { idempotencyKey } = input;

    async function createNewSession(): Promise<CreatePortalSessionOutput> {
      const portalSessionInput = {
        userId: user.id,
        returnUrl: toBillingReturnUrl(d.appUrl),
      } as const;

      const result = await d.createPortalSessionUseCase.execute(
        idempotencyKey
          ? { ...portalSessionInput, idempotencyKey }
          : portalSessionInput,
      );

      return CreatePortalSessionOutputSchema.parse(result);
    }

    async function enforcePortalRateLimit(): Promise<void> {
      const portalRateLimit = await d.rateLimiter.limit({
        key: `billing:createPortalSession:${user.id}`,
        ...PORTAL_SESSION_RATE_LIMIT,
      });
      if (!portalRateLimit.success) {
        throw new ApplicationError(
          'RATE_LIMITED',
          `Too many billing portal attempts. Try again in ${portalRateLimit.retryAfterSeconds}s.`,
        );
      }
    }

    return executeIdempotent({
      d,
      userId: user.id,
      action: 'billing:createPortalSession',
      idempotencyKey,
      outputSchema: CreatePortalSessionOutputSchema,
      beforeExecute: enforcePortalRateLimit,
      execute: createNewSession,
    });
  },
});
