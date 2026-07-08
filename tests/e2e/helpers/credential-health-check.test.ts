import type postgres from 'postgres';
import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import {
  type CredentialHealthCheckServices,
  CredentialValidationError,
  computeMigrationContentDrift,
  computeMissingMigrations,
  fetchWithTimeout,
  formatSchemaDriftMessage,
  runE2ECredentialHealthCheck,
  verifyMigrationLedger,
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
    verifyMigrationLedger: vi.fn(async (_sql) => {}),
    verifyIdempotencySchema: vi.fn(async (_sql) => {}),
    resolveClerkUserId: vi.fn(async () => 'user_123'),
    verifyClerkPassword: vi.fn(async () => true),
    verifyStripeSecretKey: vi.fn(async (_stripe) => {}),
    verifyStripePriceId: vi.fn(async (_input) => {}),
    ...overrides,
  };
}

describe('fetchWithTimeout', () => {
  it('aborts when the timeout elapses', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('signal missing'));
            return;
          }

          signal.addEventListener(
            'abort',
            () => {
              reject(
                new DOMException('The operation was aborted.', 'AbortError'),
              );
            },
            { once: true },
          );
        }),
    );

    vi.useFakeTimers();

    try {
      const promise = fetchWithTimeout(
        'https://example.com/slow',
        {
          method: 'GET',
        },
        5_000,
      );
      const rejection = expect(promise).rejects.toMatchObject({
        name: 'AbortError',
      });

      await vi.advanceTimersByTimeAsync(5_000);

      await rejection;
    } finally {
      vi.useRealTimers();
      fetchSpy.mockRestore();
    }
  });

  it('aborts when the caller signal aborts before timeout', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('signal missing'));
            return;
          }

          signal.addEventListener(
            'abort',
            () => {
              reject(
                new DOMException('The operation was aborted.', 'AbortError'),
              );
            },
            { once: true },
          );
        }),
    );

    const callerController = new AbortController();

    try {
      const promise = fetchWithTimeout(
        'https://example.com/slow',
        {
          method: 'GET',
          signal: callerController.signal,
        },
        30_000,
      );

      callerController.abort();

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      const forwardedSignal = fetchSpy.mock.calls[0]?.[1]?.signal;
      expect(forwardedSignal).toBeDefined();
      expect(forwardedSignal).not.toBe(callerController.signal);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('forwards caller abort reason to the internal signal', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('signal missing'));
            return;
          }

          signal.addEventListener(
            'abort',
            () => {
              reject(signal.reason);
            },
            { once: true },
          );
        }),
    );

    const callerController = new AbortController();
    const abortReason = new Error('caller-cancelled');

    try {
      const promise = fetchWithTimeout(
        'https://example.com/slow',
        {
          method: 'GET',
          signal: callerController.signal,
        },
        30_000,
      );

      callerController.abort(abortReason);

      await expect(promise).rejects.toBe(abortReason);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

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
    const migrationCallArg = vi.mocked(services.verifyMigrationLedger).mock
      .calls[0]?.[0];
    expect(databaseCallArg).toBeDefined();
    expect(migrationCallArg).toBeDefined();
    expect(schemaCallArg).toBeDefined();
    expect(migrationCallArg).toBe(databaseCallArg);
    expect(schemaCallArg).toBe(databaseCallArg);
    expect(
      vi.mocked(services.checkDatabaseConnectivity).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(services.verifyMigrationLedger).mock.invocationCallOrder[0] ??
        0,
    );
    expect(
      vi.mocked(services.verifyMigrationLedger).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(services.verifyIdempotencySchema).mock.invocationCallOrder[0] ??
        0,
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
    expect(services.verifyMigrationLedger).not.toHaveBeenCalled();
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

  it('exposes all aggregated failures in top-level error cause', async () => {
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

    try {
      await runE2ECredentialHealthCheck({
        env,
        services,
      });
      throw new Error('Expected credential health check to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const topLevelError = error as Error;
      expect(Array.isArray(topLevelError.cause)).toBe(true);
      const causes = topLevelError.cause as CredentialValidationError[];
      expect(causes).toHaveLength(2);
      expect(causes[0]?.code).toBe('E2E_PREFLIGHT:DATABASE_CONNECT_FAILED');
      expect(causes[1]?.code).toBe('E2E_PREFLIGHT:STRIPE_SECRET_KEY_INVALID');
    }
  });

  it('accepts Clerk paginated user-list response shape in the default resolver', async () => {
    const env = createEnv();
    const verifyClerkPassword = vi.fn(async () => true);
    const services: Partial<CredentialHealthCheckServices> = {
      checkDatabaseConnectivity: vi.fn(async (_sql) => {}),
      verifyMigrationLedger: vi.fn(async (_sql) => {}),
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

  it('sends JSON when verifying Clerk password in the default verifier', async () => {
    const env = createEnv();
    const services: Partial<CredentialHealthCheckServices> = {
      checkDatabaseConnectivity: vi.fn(async (_sql) => {}),
      verifyMigrationLedger: vi.fn(async (_sql) => {}),
      verifyIdempotencySchema: vi.fn(async (_sql) => {}),
      verifyStripeSecretKey: vi.fn(async (_stripe) => {}),
      verifyStripePriceId: vi.fn(async (_input) => {}),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'user_123' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verified: true }), {
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

      const verifyPasswordCall = fetchSpy.mock.calls[1];
      const verifyPasswordInit = verifyPasswordCall?.[1];

      expect(verifyPasswordCall?.[0]).toContain('/verify_password');
      expect(verifyPasswordInit?.method).toBe('POST');
      expect(verifyPasswordInit?.headers).toMatchObject({
        'Content-Type': 'application/json',
      });
      expect(verifyPasswordInit?.body).toBe(
        JSON.stringify({ password: env.E2E_CLERK_USER_PASSWORD }),
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
    const rootCause = new Error('timeout');
    const services = createServices({
      resolveClerkUserId: vi.fn(async () => {
        throw rootCause;
      }),
    });

    try {
      await runE2ECredentialHealthCheck({
        env,
        services,
      });
      throw new Error('Expected credential health check to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const topLevelError = error as Error;
      expect(topLevelError.message).toContain('[E2E_PREFLIGHT:UNEXPECTED]');
      expect(Array.isArray(topLevelError.cause)).toBe(true);
      const topLevelCauses = topLevelError.cause as CredentialValidationError[];
      expect(topLevelCauses).toHaveLength(1);
      const wrappedError = topLevelCauses[0];
      if (wrappedError === undefined) {
        throw new Error('Expected wrapped credential validation error');
      }
      expect(wrappedError.code).toBe('E2E_PREFLIGHT:UNEXPECTED');
      expect(wrappedError.cause).toBe(rootCause);
    }
  });

  it('preserves cause on CredentialValidationError', () => {
    const rootCause = new Error('root');
    const error = new CredentialValidationError(
      'E2E_PREFLIGHT:TEST',
      'test message',
      'test fix',
      { cause: rootCause },
    );

    expect(error.cause).toBe(rootCause);
  });

  it('maps Stripe authentication failures to credential-invalid code', async () => {
    const env = createEnv();
    const services: Partial<CredentialHealthCheckServices> = {
      checkDatabaseConnectivity: vi.fn(async (_sql) => {}),
      verifyMigrationLedger: vi.fn(async (_sql) => {}),
      verifyIdempotencySchema: vi.fn(async (_sql) => {}),
      resolveClerkUserId: vi.fn(async () => 'user_123'),
      verifyClerkPassword: vi.fn(async () => true),
    };
    const stripeProbe = new Stripe('sk_test_probe');
    const accountsResourcePrototype = Object.getPrototypeOf(
      stripeProbe.accounts,
    );
    const accountRetrieveSpy = vi
      .spyOn(accountsResourcePrototype, 'retrieve')
      .mockRejectedValue(
        new Stripe.errors.StripeAuthenticationError({
          type: 'invalid_request_error',
          message: 'invalid key',
        }),
      );

    try {
      await expect(
        runE2ECredentialHealthCheck({
          env,
          services,
        }),
      ).rejects.toThrow('[E2E_PREFLIGHT:STRIPE_SECRET_KEY_INVALID]');
    } finally {
      accountRetrieveSpy.mockRestore();
    }
  });

  it('maps non-auth Stripe price errors to API-unavailable code', async () => {
    const env = createEnv();
    const services: Partial<CredentialHealthCheckServices> = {
      checkDatabaseConnectivity: vi.fn(async (_sql) => {}),
      verifyMigrationLedger: vi.fn(async (_sql) => {}),
      verifyIdempotencySchema: vi.fn(async (_sql) => {}),
      resolveClerkUserId: vi.fn(async () => 'user_123'),
      verifyClerkPassword: vi.fn(async () => true),
    };
    const stripeProbe = new Stripe('sk_test_probe');
    const accountsResourcePrototype = Object.getPrototypeOf(
      stripeProbe.accounts,
    );
    const pricesResourcePrototype = Object.getPrototypeOf(stripeProbe.prices);
    const accountRetrieveSpy = vi
      .spyOn(accountsResourcePrototype, 'retrieve')
      .mockResolvedValue({} as Stripe.Response<Stripe.Account>);
    const priceRetrieveSpy = vi
      .spyOn(pricesResourcePrototype, 'retrieve')
      .mockRejectedValue(
        new Stripe.errors.StripeConnectionError({
          type: 'api_error',
          message: 'connection error',
        }),
      );

    try {
      await expect(
        runE2ECredentialHealthCheck({
          env,
          services,
        }),
      ).rejects.toThrow('[E2E_PREFLIGHT:STRIPE_API_UNAVAILABLE]');
    } finally {
      priceRetrieveSpy.mockRestore();
      accountRetrieveSpy.mockRestore();
    }
  });
});

describe('migration ledger schema-drift preflight', () => {
  const hashA =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const hashB =
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const hashC =
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

  const journalEntries = [
    {
      idx: 0,
      tag: '0000_jazzy_vermin',
      when: 1769893923091,
      hash: hashA,
    },
    {
      idx: 1,
      tag: '0001_attempts_selected_choice_not_null',
      when: 1769942859252,
      hash: hashB,
    },
    {
      idx: 2,
      tag: '0002_curious_firelord',
      when: 1770067162278,
      hash: hashC,
    },
  ] as const;

  it('passes through silently when every journal migration exists in the ledger', async () => {
    expect(
      computeMissingMigrations(journalEntries, [
        1769893923091,
        '1769942859252',
        1770067162278n,
      ]),
    ).toEqual([]);

    const sql = vi.fn(async () => [
      { createdAt: 1769893923091, hash: hashA },
      { createdAt: '1769942859252', hash: hashB },
      { createdAt: 1770067162278n, hash: hashC },
    ]);

    await expect(
      verifyMigrationLedger(sql as unknown as postgres.Sql, journalEntries),
    ).resolves.toBeUndefined();
  });

  it('throws the content-drift code when a ledger row hash differs from the local migration file hash', async () => {
    const sql = vi.fn(async () => [
      { createdAt: 1769893923091, hash: hashA },
      {
        createdAt: '1769942859252',
        hash: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      },
      { createdAt: 1770067162278n, hash: hashC },
    ]);

    await expect(
      verifyMigrationLedger(sql as unknown as postgres.Sql, journalEntries),
    ).rejects.toMatchObject({
      code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATION_CONTENT',
      message: expect.stringContaining(
        'Content drift: 0001_attempts_selected_choice_not_null',
      ),
      fix: expect.stringContaining('Do not amend applied migrations'),
    });
  });

  it('throws the content-drift code when the ledger contains a migration unknown to the local journal', async () => {
    const sql = vi.fn(async () => [
      { createdAt: 1769893923091, hash: hashA },
      { createdAt: '1769942859252', hash: hashB },
      { createdAt: 1770067162278n, hash: hashC },
      {
        createdAt: 1999999999999,
        hash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      },
    ]);

    await expect(
      verifyMigrationLedger(sql as unknown as postgres.Sql, journalEntries),
    ).rejects.toMatchObject({
      code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATION_CONTENT',
      message: expect.stringContaining('Ledger-only migrations: 1999999999999'),
    });
  });

  it('allows the measured legacy 0027 dev hash repaired by 0028', async () => {
    const measuredEarly0027Hash =
      '15124dc7eab8b5ab3e239d13ee1011ea515b96567771270658b47de84b9faf3c';
    const current0027Hash =
      '983c3458e8aadd6acaddbce0b514321f0cec4f0a2767b3a74b6442e9f0d4d35d';
    const sql = vi.fn(async () => [
      {
        createdAt: 1783355955875,
        hash: measuredEarly0027Hash,
      },
    ]);

    await expect(
      verifyMigrationLedger(sql as unknown as postgres.Sql, [
        {
          idx: 27,
          tag: '0027_early_wallow',
          when: 1783355955875,
          hash: current0027Hash,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('formats content-drift failures without leaking secrets, hostnames, or full hashes', async () => {
    const appliedHash =
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
    const databaseUrl =
      'postgresql://e2e_owner:super-secret-password@ep-private-host.neon.tech/addiction_boards';
    const sql = vi.fn(async () => [
      { createdAt: 1769893923091, hash: appliedHash },
      { createdAt: '1769942859252', hash: hashB },
      { createdAt: 1770067162278n, hash: hashC },
    ]);

    try {
      await verifyMigrationLedger(
        sql as unknown as postgres.Sql,
        journalEntries,
      );
      throw new Error('Expected verifyMigrationLedger to reject');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATION_CONTENT',
      });
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('expected aaaaaaaaaaaaaaaa');
      expect(message).toContain('applied dddddddddddddddd');
      expect(message).not.toContain(databaseUrl);
      expect(message).not.toContain('ep-private-host.neon.tech');
      expect(message).not.toContain('super-secret-password');
      expect(message).not.toContain(hashA);
      expect(message).not.toContain(appliedHash);
    }
  });

  it('computes content drift from local hashes and applied ledger rows', () => {
    expect(
      computeMigrationContentDrift(journalEntries, [
        { createdAt: 1769893923091, hash: hashA },
        {
          createdAt: 1769942859252,
          hash: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        },
        { createdAt: 1770067162278, hash: hashC },
        {
          createdAt: 1999999999999,
          hash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        },
      ]),
    ).toEqual([
      {
        kind: 'hash-mismatch',
        tag: '0001_attempts_selected_choice_not_null',
        expectedHashPrefix: 'bbbbbbbbbbbbbbbb',
        appliedHashPrefix: 'dddddddddddddddd',
      },
      {
        kind: 'ledger-only',
        createdAt: '1999999999999',
      },
    ]);
  });

  it('throws the schema-drift code when one or more journal migrations are absent from the ledger', async () => {
    expect(computeMissingMigrations(journalEntries, [1769893923091])).toEqual([
      '0001_attempts_selected_choice_not_null',
      '0002_curious_firelord',
    ]);

    const sql = vi.fn(async () => [{ createdAt: 1769893923091 }]);

    await expect(
      verifyMigrationLedger(sql as unknown as postgres.Sql, journalEntries),
    ).rejects.toMatchObject({
      code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATIONS',
      message:
        'The database used by E2E is behind the repo migration journal. Missing migrations: 0001_attempts_selected_choice_not_null, 0002_curious_firelord.',
      fix: expect.stringContaining(
        'DATABASE_URL="<verified target>" pnpm db:migrate',
      ),
    });
  });

  it('treats an absent drizzle schema as schema drift with all journal migrations missing', async () => {
    const missingSchemaError = Object.assign(
      new Error('schema "drizzle" does not exist'),
      { code: '3F000' },
    );
    const sql = vi.fn(async () => {
      throw missingSchemaError;
    });

    await expect(
      verifyMigrationLedger(sql as unknown as postgres.Sql, journalEntries),
    ).rejects.toMatchObject({
      code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATIONS',
      message:
        'The database used by E2E is behind the repo migration journal. Missing migrations: 0000_jazzy_vermin, 0001_attempts_selected_choice_not_null, 0002_curious_firelord.',
    });
  });

  it('treats an absent drizzle migration table as schema drift with all journal migrations missing', async () => {
    const missingTableError = Object.assign(
      new Error('relation "drizzle.__drizzle_migrations" does not exist'),
      { code: '42P01' },
    );
    const sql = vi.fn(async () => {
      throw missingTableError;
    });

    await expect(
      verifyMigrationLedger(sql as unknown as postgres.Sql, journalEntries),
    ).rejects.toMatchObject({
      code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATIONS',
      message:
        'The database used by E2E is behind the repo migration journal. Missing migrations: 0000_jazzy_vermin, 0001_attempts_selected_choice_not_null, 0002_curious_firelord.',
    });
  });

  it('formats missing migration messages without leaking secrets, hostnames, passwords, or Drizzle hashes', () => {
    const databaseUrl =
      'postgresql://e2e_owner:super-secret-password@ep-private-host.neon.tech/addiction_boards';
    const drizzleHash =
      'bd3f2c7ad0212ddc9fbb7c2c07bdc4c7b4f9cce34638f93af18c0218cdd7e4e5';
    const message = formatSchemaDriftMessage([
      '0019_illegal_warbound',
      '0020_fat_ironclad',
    ]);

    expect(message).toContain(
      'Missing migrations: 0019_illegal_warbound, 0020_fat_ironclad.',
    );
    expect(message).not.toContain(databaseUrl);
    expect(message).not.toContain('ep-private-host.neon.tech');
    expect(message).not.toContain('super-secret-password');
    expect(message).not.toContain(drizzleHash);
  });
});
