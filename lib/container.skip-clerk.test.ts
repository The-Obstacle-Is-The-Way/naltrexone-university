import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

describe('container (skip clerk)', () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('does not import Clerk server modules when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.DATABASE_URL ??=
      'postgresql://user:pass@localhost:5432/addiction_boards_test';
    process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY ??= 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL ??= 'price_dummy_annual';
    process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';

    vi.doMock('server-only', () => ({}));
    vi.doMock('stripe', () => ({
      default: class StripeMock {},
    }));
    vi.doMock('@clerk/nextjs/server', () => {
      throw new Error('Publishable key not valid.');
    });

    const { createContainer } = await import('./container');
    const container = createContainer({
      primitives: {
        db: {} as unknown as DrizzleDb,
        env: {
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
          NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
          STRIPE_WEBHOOK_SECRET: 'whsec',
          NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        } as unknown as typeof import('./env').env,
        logger: {
          error: () => undefined,
        } as unknown as typeof import('./logger').logger,
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
