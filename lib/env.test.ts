import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

vi.mock('server-only', () => ({}));

const ORIGINAL_ENV = snapshotProcessEnv();

describe('env', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('logs and throws when env schema validation fails', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    process.env.DATABASE_URL = 'not-a-url';

    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      'Invalid environment variables',
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toBe('Invalid environment variables:');
  });

  it('allows missing Clerk keys when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.VERCEL_ENV;

    vi.resetModules();

    await expect(import('@/lib/env')).resolves.toHaveProperty('env');
  });

  it('allows NEXT_PUBLIC_SKIP_CLERK=true even when NODE_ENV=production (next build)', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    (process.env as Record<string, string | undefined>).npm_lifecycle_event =
      'build';
    delete process.env.VERCEL_ENV;

    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

    vi.resetModules();

    await expect(import('@/lib/env')).resolves.toHaveProperty('env');
  });

  it('rejects NEXT_PUBLIC_SKIP_CLERK=true on Vercel production deploys', async () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.VERCEL_ENV = 'production';
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';

    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      'NEXT_PUBLIC_SKIP_CLERK must not be true in production',
    );
  });

  it('rejects NEXT_PUBLIC_SKIP_CLERK=true in non-Vercel production runtime', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    (process.env as Record<string, string | undefined>).npm_lifecycle_event =
      'start';
    delete process.env.VERCEL_ENV;

    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      'NEXT_PUBLIC_SKIP_CLERK must not be true in production',
    );
  });

  it('allows missing CLERK_WEBHOOK_SIGNING_SECRET when not on Vercel production deploys', async () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    process.env.CLERK_SECRET_KEY = 'sk_test_clerk_dummy';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_clerk_dummy';
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    delete process.env.VERCEL_ENV;

    vi.resetModules();

    await expect(import('@/lib/env')).resolves.toHaveProperty('env');
  });

  it('requires CLERK_WEBHOOK_SIGNING_SECRET in non-Vercel production runtime when Clerk is enabled', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    (process.env as Record<string, string | undefined>).npm_lifecycle_event =
      'start';
    delete process.env.VERCEL_ENV;

    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    process.env.CLERK_SECRET_KEY = 'sk_test_clerk_dummy';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_clerk_dummy';
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;

    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      'Invalid environment variables',
    );
  });

  it('requires CLERK_WEBHOOK_SIGNING_SECRET on Vercel production deploys when Clerk is enabled', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.VERCEL_ENV = 'production';
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    process.env.CLERK_SECRET_KEY = 'sk_test_clerk_dummy';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_clerk_dummy';
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;

    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      'Invalid environment variables',
    );
  });

  it('requires Clerk keys when NEXT_PUBLIC_SKIP_CLERK is not true', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.VERCEL_ENV;

    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      'Invalid environment variables',
    );
  });

  it('rejects Clerk keys with mismatched environments (pk_test vs sk_live)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    process.env.CLERK_SECRET_KEY = 'sk_live_dummy';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_dummy';
    delete process.env.VERCEL_ENV;

    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      'Invalid environment variables',
    );
  });

  it('rejects Clerk keys that appear to reference different instances', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_b25l';
    process.env.CLERK_SECRET_KEY = 'sk_test_dHdv_secret';
    delete process.env.VERCEL_ENV;

    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      'Invalid environment variables',
    );
  });
});
