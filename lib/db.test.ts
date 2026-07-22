import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

function setSharedTestEnv(): void {
  process.env.DATABASE_URL =
    'postgresql://user:pass@localhost:5432/addiction_boards_test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
}

describe('database connection pool', () => {
  let postgresConstructor: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
    setSharedTestEnv();

    vi.doMock('server-only', () => ({}));
    postgresConstructor = vi.fn(() => ({}));
    vi.doMock('postgres', () => ({ default: postgresConstructor }));
    vi.doMock('drizzle-orm/postgres-js', () => ({
      drizzle: vi.fn(() => ({})),
    }));

    await import('./db');
  });

  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
  });

  it('passes the explicit SPEC-029 serverless pool size to postgres.js', () => {
    expect(postgresConstructor).toHaveBeenCalledTimes(1);
    expect(postgresConstructor.mock.calls[0]?.[1]).toMatchObject({
      max: 10,
    });
  });
});
