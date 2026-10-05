import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

// A 32-byte base64 key, the shape Next.js reads.
const ACTION_KEY = Buffer.alloc(32, 7).toString('base64');

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

  it('rejects a configured Resend API key without the provider prefix', async () => {
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
    process.env.RESEND_API_KEY = 'not-a-resend-key';

    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      'Invalid environment variables',
    );
  });

  it('rejects a configured Resend webhook secret without the signing-secret prefix', async () => {
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
    process.env.RESEND_WEBHOOK_SECRET = 'not-a-signing-secret';

    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      'Invalid environment variables',
    );
  });

  it('rejects a configured consent-state secret that is too short', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/db';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    process.env.CONSENT_STATE_SECRET = 'too-short';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';

    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      'Invalid environment variables',
    );
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

    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = ACTION_KEY;

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

    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = ACTION_KEY;

    vi.resetModules();

    await expect(import('@/lib/env')).resolves.toHaveProperty('env');
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

    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = ACTION_KEY;

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
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = ACTION_KEY;
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

  // BUG-319: without a stable key, every build changes the server-action
  // IDs, and a page loaded before a deploy can no longer subscribe. A Vercel
  // build without it must fail rather than ship that silently.
  function setValidVercelEnv(vercelEnv: 'production' | 'preview') {
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
    process.env.VERCEL_ENV = vercelEnv;
  }

  it.each(['production', 'preview'] as const)(
    'requires NEXT_SERVER_ACTIONS_ENCRYPTION_KEY on a Vercel %s build',
    async (vercelEnv) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      setValidVercelEnv(vercelEnv);
      delete process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
      vi.resetModules();

      await expect(import('@/lib/env')).rejects.toThrow(
        'Invalid environment variables',
      );
    },
  );

  it.each(['production', 'preview'] as const)(
    'accepts a Vercel %s build that sets NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
    async (vercelEnv) => {
      setValidVercelEnv(vercelEnv);
      process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = ACTION_KEY;
      vi.resetModules();

      await expect(import('@/lib/env')).resolves.toHaveProperty('env');
    },
  );

  it('does not require NEXT_SERVER_ACTIONS_ENCRYPTION_KEY off Vercel', async () => {
    setValidVercelEnv('production');
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
    vi.resetModules();

    await expect(import('@/lib/env')).resolves.toHaveProperty('env');
  });

  it.each([
    ['not base64', 'not a key!'],
    ['the wrong length', Buffer.alloc(20, 7).toString('base64')],
    // Node's decoder skips the stray character and still yields 32 bytes;
    // the browser-style decoder Next uses rejects it.
    [
      'malformed but decodes to 32 bytes',
      `${ACTION_KEY.slice(0, 10)}!${ACTION_KEY.slice(10)}`,
    ],
  ])(
    'rejects a NEXT_SERVER_ACTIONS_ENCRYPTION_KEY that is %s',
    async (_, key) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      setValidVercelEnv('production');
      process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = key;
      vi.resetModules();

      await expect(import('@/lib/env')).rejects.toThrow(
        'Invalid environment variables',
      );
    },
  );
});
