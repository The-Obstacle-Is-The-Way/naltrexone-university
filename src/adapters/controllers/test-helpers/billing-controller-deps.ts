import type { RateLimiter } from '@/src/application/ports/gateways';
import {
  FakeAuthGateway,
  FakeCreateCheckoutSessionUseCase,
  FakeCreatePortalSessionUseCase,
  FakeCreateTrialPaymentMethodSetupSessionUseCase,
  FakeIdempotencyKeyRepository,
  FakeLogger,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import type {
  CreateCheckoutSessionOutput,
  CreatePortalSessionOutput,
} from '@/src/application/use-cases';
import type { User } from '@/src/domain/entities';
import { createUser } from '@/src/domain/test-helpers';
import type { BillingControllerDeps } from '../billing-controller';

export type BillingControllerTestDeps = BillingControllerDeps & {
  createCheckoutSessionUseCase: FakeCreateCheckoutSessionUseCase;
  createPortalSessionUseCase: FakeCreatePortalSessionUseCase;
  createTrialPaymentMethodSetupSessionUseCase: FakeCreateTrialPaymentMethodSetupSessionUseCase;
  _calls: {
    clerkCalls: Array<undefined>;
  };
  _fixtures: {
    userId: string;
  };
};

export function createBillingControllerDeps(overrides?: {
  user?: User | null;
  appUrl?: string;
  clerkUserId?: string | null;
  checkoutOutput?: CreateCheckoutSessionOutput;
  checkoutThrows?: unknown;
  portalOutput?: CreatePortalSessionOutput;
  portalThrows?: unknown;
  setupThrows?: unknown;
  rateLimiter?: RateLimiter;
  now?: () => Date;
}): BillingControllerTestDeps {
  const user =
    overrides?.user === undefined
      ? createUser({
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
      : overrides.user;
  const userId = user?.id ?? crypto.randomUUID();

  const appUrl = overrides?.appUrl ?? 'https://app.example.com';
  const clerkUserId =
    overrides?.clerkUserId === undefined ? 'clerk_1' : overrides.clerkUserId;

  const now = overrides?.now ?? (() => new Date('2026-02-01T00:00:00Z'));

  const authGateway = new FakeAuthGateway(user);

  const createCheckoutSessionUseCase = new FakeCreateCheckoutSessionUseCase(
    overrides?.checkoutOutput ?? { url: 'https://stripe/checkout' },
    overrides?.checkoutThrows,
  );

  const createPortalSessionUseCase = new FakeCreatePortalSessionUseCase(
    overrides?.portalOutput ?? { url: 'https://stripe/portal' },
    overrides?.portalThrows,
  );
  const createTrialPaymentMethodSetupSessionUseCase =
    new FakeCreateTrialPaymentMethodSetupSessionUseCase(
      {
        url: 'https://stripe/setup',
      },
      overrides?.setupThrows,
    );

  const rateLimiter: RateLimiter =
    overrides?.rateLimiter ?? new FakeRateLimiter();

  const clerkCalls: Array<undefined> = [];

  return {
    authGateway,
    logger: new FakeLogger(),
    createCheckoutSessionUseCase,
    createPortalSessionUseCase,
    createTrialPaymentMethodSetupSessionUseCase,
    idempotencyKeyRepository: new FakeIdempotencyKeyRepository(now),
    rateLimiter,
    getClerkUserId: async () => {
      clerkCalls.push(undefined);
      return clerkUserId;
    },
    appUrl,
    now,
    _calls: {
      clerkCalls,
    },
    _fixtures: {
      userId,
    },
  };
}
