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

  it('allows NEXT_PUBLIC_SKIP_CLERK=true when VERCEL_ENV is not production', async () => {
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

  it('allows NEXT_PUBLIC_SKIP_CLERK=true on Vercel preview', async () => {
    process.env.VERCEL_ENV = 'preview';

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

  it('parses FREE_TRIAL_ENABLED=true', async () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    process.env.FREE_TRIAL_ENABLED = 'true';
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.VERCEL_ENV;

    vi.resetModules();

    const { env } = await import('@/lib/env');
    expect(env.FREE_TRIAL_ENABLED).toBe('true');
  });

  it('parses FREE_TRIAL_ENABLED=false', async () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    process.env.FREE_TRIAL_ENABLED = 'false';
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.VERCEL_ENV;

    vi.resetModules();

    const { env } = await import('@/lib/env');
    expect(env.FREE_TRIAL_ENABLED).toBe('false');
  });

  it('leaves FREE_TRIAL_ENABLED undefined when unset', async () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    delete process.env.FREE_TRIAL_ENABLED;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.VERCEL_ENV;

    vi.resetModules();

    const { env } = await import('@/lib/env');
    expect(env.FREE_TRIAL_ENABLED).toBeUndefined();
  });

  it('rejects FREE_TRIAL_ENABLED set to an invalid value', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';

    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    process.env.FREE_TRIAL_ENABLED = 'yes';
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.VERCEL_ENV;

    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      'Invalid environment variables',
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

  it('allows missing CLERK_WEBHOOK_SIGNING_SECRET when VERCEL_ENV is not production', async () => {
    process.env.VERCEL_ENV = 'preview';

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

    await expect(import('@/lib/env')).resolves.toHaveProperty('env');
  });

  it('allows missing CRON_SECRET on Vercel production (validated at route level, not startup)', async () => {
    process.env.VERCEL_ENV = 'production';

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
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = 'whsec_clerk_dummy';
    delete process.env.CRON_SECRET;

    vi.resetModules();

    await expect(import('@/lib/env')).resolves.toHaveProperty('env');
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
