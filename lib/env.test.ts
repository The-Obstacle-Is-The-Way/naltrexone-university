import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

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

describe('env', () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
    vi.restoreAllMocks();
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

    await expect(import('./env')).resolves.toHaveProperty('env');
  });

  it('allows NEXT_PUBLIC_SKIP_CLERK=true even when NODE_ENV=production (next build)', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
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

    await expect(import('./env')).resolves.toHaveProperty('env');
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

    await expect(import('./env')).rejects.toThrow(
      'NEXT_PUBLIC_SKIP_CLERK must not be true in production (VERCEL_ENV=production)',
    );
  });

  it('requires Clerk keys when NEXT_PUBLIC_SKIP_CLERK is not true', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

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

    await expect(import('./env')).rejects.toThrow(
      'Invalid environment variables',
    );
    consoleError.mockRestore();
  });
});
