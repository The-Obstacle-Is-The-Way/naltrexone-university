import { describe, expect, it, vi } from 'vitest';
import {
  type CredentialHealthCheckServices,
  CredentialValidationError,
  runE2ECredentialHealthCheck,
} from './credential-health-check';

type RequiredEnvKey =
  | 'DATABASE_URL'
  | 'CLERK_SECRET_KEY'
  | 'E2E_CLERK_USER_USERNAME'
  | 'E2E_CLERK_USER_PASSWORD'
  | 'STRIPE_SECRET_KEY'
  | 'NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY';

function createEnv(
  overrides: Partial<Record<RequiredEnvKey, string | undefined>> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL:
      'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
    CLERK_SECRET_KEY: 'sk_test_clerk',
    E2E_CLERK_USER_USERNAME: 'e2e-test@example.com',
    E2E_CLERK_USER_PASSWORD: 'E2eTestPass1',
    STRIPE_SECRET_KEY: 'sk_test_stripe',
    NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_monthly',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function createServices(
  overrides: Partial<CredentialHealthCheckServices> = {},
): CredentialHealthCheckServices {
  return {
    checkDatabaseConnectivity: vi.fn(async () => {}),
    verifyIdempotencySchema: vi.fn(async () => {}),
    resolveClerkUserId: vi.fn(async () => 'user_123'),
    verifyClerkPassword: vi.fn(async () => true),
    verifyStripeSecretKey: vi.fn(async () => {}),
    verifyStripePriceId: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('runE2ECredentialHealthCheck', () => {
  it('runs all validators when credentials are valid', async () => {
    const services = createServices();
    const env = createEnv();

    await expect(
      runE2ECredentialHealthCheck({
        env,
        services,
      }),
    ).resolves.toBeUndefined();

    expect(services.checkDatabaseConnectivity).toHaveBeenCalledWith(
      env.DATABASE_URL,
    );
    expect(services.verifyIdempotencySchema).toHaveBeenCalledWith(
      env.DATABASE_URL,
    );
    expect(services.resolveClerkUserId).toHaveBeenCalledWith({
      email: env.E2E_CLERK_USER_USERNAME,
      clerkSecretKey: env.CLERK_SECRET_KEY,
    });
    expect(services.verifyClerkPassword).toHaveBeenCalledWith({
      userId: 'user_123',
      password: env.E2E_CLERK_USER_PASSWORD,
      clerkSecretKey: env.CLERK_SECRET_KEY,
    });
    expect(services.verifyStripeSecretKey).toHaveBeenCalledWith(
      env.STRIPE_SECRET_KEY,
    );
    expect(services.verifyStripePriceId).toHaveBeenCalledWith({
      stripeSecretKey: env.STRIPE_SECRET_KEY,
      priceId: env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
    });
  });

  it('fails with actionable missing env errors and skips external calls', async () => {
    const services = createServices();
    const env = createEnv({
      DATABASE_URL: undefined,
      CLERK_SECRET_KEY: undefined,
      E2E_CLERK_USER_USERNAME: undefined,
      E2E_CLERK_USER_PASSWORD: undefined,
      STRIPE_SECRET_KEY: undefined,
      NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: undefined,
    });

    await expect(
      runE2ECredentialHealthCheck({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_PREFLIGHT] Credential validation failed (6):');

    await expect(
      runE2ECredentialHealthCheck({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_PREFLIGHT:DATABASE_URL_MISSING]');
    await expect(
      runE2ECredentialHealthCheck({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_PREFLIGHT:CLERK_SECRET_KEY_MISSING]');
    await expect(
      runE2ECredentialHealthCheck({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_PREFLIGHT:E2E_CLERK_USER_USERNAME_MISSING]');
    await expect(
      runE2ECredentialHealthCheck({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_PREFLIGHT:E2E_CLERK_USER_PASSWORD_MISSING]');
    await expect(
      runE2ECredentialHealthCheck({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_PREFLIGHT:STRIPE_SECRET_KEY_MISSING]');
    await expect(
      runE2ECredentialHealthCheck({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_PREFLIGHT:STRIPE_MONTHLY_PRICE_ID_MISSING]');

    expect(services.checkDatabaseConnectivity).not.toHaveBeenCalled();
    expect(services.verifyIdempotencySchema).not.toHaveBeenCalled();
    expect(services.resolveClerkUserId).not.toHaveBeenCalled();
    expect(services.verifyClerkPassword).not.toHaveBeenCalled();
    expect(services.verifyStripeSecretKey).not.toHaveBeenCalled();
    expect(services.verifyStripePriceId).not.toHaveBeenCalled();
  });

  it('aggregates multiple validation failures into one setup error', async () => {
    const env = createEnv();
    const services = createServices({
      checkDatabaseConnectivity: vi.fn(async () => {
        throw new CredentialValidationError(
          'E2E_PREFLIGHT:DATABASE_CONNECT_FAILED',
          'Cannot connect to Postgres with DATABASE_URL.',
          'Verify Neon/Postgres URL, credentials, and network reachability.',
        );
      }),
      verifyStripeSecretKey: vi.fn(async () => {
        throw new CredentialValidationError(
          'E2E_PREFLIGHT:STRIPE_SECRET_KEY_INVALID',
          'Stripe rejected STRIPE_SECRET_KEY.',
          'Use a valid Stripe test secret key (sk_test_...).',
        );
      }),
    });

    const promise = runE2ECredentialHealthCheck({
      env,
      services,
    });

    await expect(promise).rejects.toThrow(
      '[E2E_PREFLIGHT] Credential validation failed (2):',
    );
    await expect(promise).rejects.toThrow(
      '[E2E_PREFLIGHT:DATABASE_CONNECT_FAILED]',
    );
    await expect(promise).rejects.toThrow(
      '[E2E_PREFLIGHT:STRIPE_SECRET_KEY_INVALID]',
    );
  });

  it('fails with schema drift code when idempotency column check fails', async () => {
    const env = createEnv();
    const services = createServices({
      verifyIdempotencySchema: vi.fn(async () => {
        throw new CredentialValidationError(
          'E2E_PREFLIGHT:SCHEMA_DRIFT_IDEMPOTENCY_KEYS',
          'Database schema drift detected: idempotency_keys.completed_at column is missing.',
          'Run migrations against this database (pnpm db:migrate).',
        );
      }),
    });

    await expect(
      runE2ECredentialHealthCheck({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_PREFLIGHT:SCHEMA_DRIFT_IDEMPOTENCY_KEYS]');
  });

  it('wraps unexpected validator errors with a deterministic error code', async () => {
    const env = createEnv();
    const services = createServices({
      resolveClerkUserId: vi.fn(async () => {
        throw new Error('timeout');
      }),
    });

    await expect(
      runE2ECredentialHealthCheck({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_PREFLIGHT:UNEXPECTED]');
  });
});
