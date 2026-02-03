import { describe, expect, it, vi } from 'vitest';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';

vi.mock('server-only', () => ({}));
vi.mock('stripe', () => ({
  default: class StripeMock {},
}));

process.env.DATABASE_URL ??=
  'postgresql://user:pass@localhost:5432/addiction_boards_test';
process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy';
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= 'pk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_dummy';
process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY ??= 'price_dummy_monthly';
process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL ??= 'price_dummy_annual';
process.env.NEXT_PUBLIC_APP_URL ??= 'http://127.0.0.1:3000';
process.env.NEXT_PUBLIC_SKIP_CLERK ??= 'true';

const currentUserMock = vi.fn(async () => {
  throw new Error(
    'currentUser must not be called when NEXT_PUBLIC_SKIP_CLERK=true',
  );
});

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: currentUserMock,
}));

describe('createContainer (skip clerk)', () => {
  it('does not call Clerk currentUser when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    const { createContainer } = await import('./container');

    const container = createContainer({
      primitives: {
        db: {} as unknown as DrizzleDb,
        env: {
          NEXT_PUBLIC_SKIP_CLERK: 'true',
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
          NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
          STRIPE_WEBHOOK_SECRET: 'whsec',
          NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
        } as unknown as typeof import('./env').env,
        logger: {
          error: () => undefined,
        } as unknown as typeof import('./logger').logger,
        stripe: {} as unknown as typeof import('./stripe').stripe,
        now: () => new Date('2026-02-01T00:00:00Z'),
      },
    });

    const authGateway = container.createAuthGateway();
    await expect(authGateway.getCurrentUser()).resolves.toBeNull();
    expect(currentUserMock).not.toHaveBeenCalled();
  });
});
