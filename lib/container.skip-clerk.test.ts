// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

function setSharedTestEnv() {
  process.env.DATABASE_URL ??=
    'postgresql://user:pass@localhost:5432/addiction_boards_test';
  process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= 'pk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_dummy';
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY ??= 'price_dummy_monthly';
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL ??= 'price_dummy_annual';
  process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
}

describe('container (skip clerk)', () => {
  beforeEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
  });

  describe('when NEXT_PUBLIC_SKIP_CLERK=true', () => {
    let createContainer: typeof import('./container').createContainer;

    beforeEach(async () => {
      setSharedTestEnv();
      process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';

      vi.doMock('server-only', () => ({}));
      vi.doMock('stripe', () => ({
        default: class StripeMock {},
      }));
      vi.doMock('@clerk/nextjs/server', () => {
        throw new Error('Publishable key not valid.');
      });

      ({ createContainer } = await import('./container'));
    });

    it('does not import Clerk server modules when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
      const container = createContainer({
        primitives: {
          db: {} as unknown as DrizzleDb,
          env: {
            NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
            NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
            STRIPE_WEBHOOK_SECRET: 'whsec',
            NEXT_PUBLIC_APP_URL: 'https://app.example.com',
          } as unknown as typeof import('./env').env,
          logger:
            new FakeLogger() as unknown as typeof import('./logger').logger,
          stripe: {} as unknown as typeof import('./stripe').stripe,
          now: () => new Date('2026-02-01T00:00:00Z'),
        },
      });

      await expect(
        container.createAuthGateway().getCurrentUser(),
      ).resolves.toBeNull();
      await expect(
        container.createBillingControllerDeps().getClerkUserId(),
      ).resolves.toBeNull();
    });
  });

  describe('when NEXT_PUBLIC_SKIP_CLERK is not true', () => {
    let createContainer: typeof import('./container').createContainer;
    let currentUser: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      setSharedTestEnv();
      process.env.CLERK_SECRET_KEY ??= 'sk_test_dummy';
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= 'pk_test_dummy';
      process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

      vi.doMock('server-only', () => ({}));
      vi.doMock('stripe', () => ({
        default: class StripeMock {},
      }));

      currentUser = vi.fn(async () => null);
      vi.doMock('@clerk/nextjs/server', () => ({
        currentUser,
      }));

      ({ createContainer } = await import('./container'));
    });

    it('loads Clerk currentUser when NEXT_PUBLIC_SKIP_CLERK is not true', async () => {
      const container = createContainer({
        primitives: {
          db: {} as unknown as DrizzleDb,
          env: {
            NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
            NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
            STRIPE_WEBHOOK_SECRET: 'whsec',
            NEXT_PUBLIC_APP_URL: 'https://app.example.com',
          } as unknown as typeof import('./env').env,
          logger:
            new FakeLogger() as unknown as typeof import('./logger').logger,
          stripe: {} as unknown as typeof import('./stripe').stripe,
          now: () => new Date('2026-02-01T00:00:00Z'),
        },
      });

      await expect(
        container.createAuthGateway().getCurrentUser(),
      ).resolves.toBeNull();
      await expect(
        container.createBillingControllerDeps().getClerkUserId(),
      ).resolves.toBeNull();
      expect(currentUser).toHaveBeenCalledTimes(2);
    });
  });
});
