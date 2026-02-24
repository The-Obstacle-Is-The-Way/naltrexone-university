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
    checkDatabaseConnectivity: vi.fn(async (_sql) => {}),
    verifyIdempotencySchema: vi.fn(async (_sql) => {}),
    resolveClerkUserId: vi.fn(async () => 'user_123'),
    verifyClerkPassword: vi.fn(async () => true),
    verifyStripeSecretKey: vi.fn(async (_stripe) => {}),
    verifyStripePriceId: vi.fn(async (_input) => {}),
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

    const databaseCallArg = vi.mocked(services.checkDatabaseConnectivity).mock
      .calls[0]?.[0];
    const schemaCallArg = vi.mocked(services.verifyIdempotencySchema).mock
      .calls[0]?.[0];
    expect(databaseCallArg).toBeDefined();
    expect(schemaCallArg).toBeDefined();
    expect(schemaCallArg).toBe(databaseCallArg);
    expect(services.resolveClerkUserId).toHaveBeenCalledWith({
      email: env.E2E_CLERK_USER_USERNAME,
      clerkSecretKey: env.CLERK_SECRET_KEY,
    });
    expect(services.verifyClerkPassword).toHaveBeenCalledWith({
      userId: 'user_123',
      password: env.E2E_CLERK_USER_PASSWORD,
      clerkSecretKey: env.CLERK_SECRET_KEY,
    });
    const stripeSecretCallArg = vi.mocked(services.verifyStripeSecretKey).mock
      .calls[0]?.[0];
    const stripePriceCallArg = vi.mocked(services.verifyStripePriceId).mock
      .calls[0]?.[0];
    expect(stripeSecretCallArg).toBeDefined();
    expect(stripePriceCallArg).toBeDefined();
    expect(stripePriceCallArg?.priceId).toBe(
      env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
    );
    expect(stripePriceCallArg?.stripe).toBe(stripeSecretCallArg);
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

    let caughtError: Error | null = null;
    try {
      await runE2ECredentialHealthCheck({
        env,
        services,
      });
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    const message = caughtError?.message ?? '';
    expect(message).toContain(
      '[E2E_PREFLIGHT] Credential validation failed (6):',
    );
    expect(message).toContain('[E2E_PREFLIGHT:DATABASE_URL_MISSING]');
    expect(message).toContain('[E2E_PREFLIGHT:CLERK_SECRET_KEY_MISSING]');
    expect(message).toContain(
      '[E2E_PREFLIGHT:E2E_CLERK_USER_USERNAME_MISSING]',
    );
    expect(message).toContain(
      '[E2E_PREFLIGHT:E2E_CLERK_USER_PASSWORD_MISSING]',
    );
    expect(message).toContain('[E2E_PREFLIGHT:STRIPE_SECRET_KEY_MISSING]');
    expect(message).toContain(
      '[E2E_PREFLIGHT:STRIPE_MONTHLY_PRICE_ID_MISSING]',
    );

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

  it('accepts Clerk paginated user-list response shape in the default resolver', async () => {
    const env = createEnv();
    const verifyClerkPassword = vi.fn(async () => true);
    const services: Partial<CredentialHealthCheckServices> = {
      checkDatabaseConnectivity: vi.fn(async (_sql) => {}),
      verifyIdempotencySchema: vi.fn(async (_sql) => {}),
      verifyClerkPassword,
      verifyStripeSecretKey: vi.fn(async (_stripe) => {}),
      verifyStripePriceId: vi.fn(async (_input) => {}),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'user_123' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    try {
      await expect(
        runE2ECredentialHealthCheck({
          env,
          services,
        }),
      ).resolves.toBeUndefined();

      expect(verifyClerkPassword).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user_123' }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
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
