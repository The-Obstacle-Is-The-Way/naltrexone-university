import { beforeEach, describe, expect, it, vi } from 'vitest';

class TestResetError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fix: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'TestResetError';
  }
}

type SharedSupportFactory =
  typeof import('./e2e-reset-shared').createSharedE2EResetSupport;

const REQUIRED_ENV_VARS = [
  {
    key: 'DATABASE_URL',
    code: 'TEST:DATABASE_URL_MISSING',
    message: 'DATABASE_URL missing',
    fix: 'Set DATABASE_URL',
  },
  {
    key: 'CLERK_SECRET_KEY',
    code: 'TEST:CLERK_SECRET_KEY_MISSING',
    message: 'CLERK_SECRET_KEY missing',
    fix: 'Set CLERK_SECRET_KEY',
  },
  {
    key: 'E2E_CLERK_USER_USERNAME',
    code: 'TEST:E2E_CLERK_USER_USERNAME_MISSING',
    message: 'E2E_CLERK_USER_USERNAME missing',
    fix: 'Set E2E_CLERK_USER_USERNAME',
  },
] as const;

function createError(
  code: string,
  message: string,
  fix: string,
  options?: ErrorOptions,
) {
  return new TestResetError(code, message, fix, options);
}

function createSupport(factory: SharedSupportFactory) {
  return factory({
    createError,
    requiredEnvVars: REQUIRED_ENV_VARS,
    failureReportLabel: '[TEST_RESET] Failure report',
    internalEnvMappingError: {
      code: 'TEST:ENV_MAPPING_INCOMPLETE',
      fix: 'Fix env mapping',
    },
    clerkApiUnavailableError: {
      code: 'TEST:CLERK_API_UNAVAILABLE',
      message: 'Clerk unavailable',
      fix: 'Retry later',
    },
    clerkSecretKeyInvalidError: {
      code: 'TEST:CLERK_SECRET_KEY_INVALID',
      message: 'Clerk rejected key',
      fix: 'Fix key',
    },
    appUserLookupFailedError: {
      code: 'TEST:APP_USER_LOOKUP_FAILED',
      message: 'App user lookup failed',
      fix: 'Fix DB',
    },
  });
}

function createSqlClient(results: unknown[] = []) {
  const queuedResults = [...results];
  const sql = vi.fn(async () => queuedResults.shift() ?? []);
  return Object.assign(sql, {
    end: vi.fn(async () => {}),
  });
}

describe('createSharedE2EResetSupport', () => {
  let createSharedE2EResetSupport: SharedSupportFactory;
  let postgresMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    postgresMock = vi.fn();
    vi.doMock('postgres', () => ({
      default: postgresMock,
    }));

    ({ createSharedE2EResetSupport } = await import('./e2e-reset-shared'));
  });

  it('resolves required env values, trims whitespace, and formats missing env failures', () => {
    const support = createSupport(createSharedE2EResetSupport);
    const failures: TestResetError[] = [];

    const resolved = support.resolveRequiredEnv(
      {
        DATABASE_URL: '  postgres://db  ',
        CLERK_SECRET_KEY: '',
        E2E_CLERK_USER_USERNAME: '  e2e@example.com  ',
      } as unknown as NodeJS.ProcessEnv,
      failures,
    );

    expect(resolved).toEqual({
      databaseUrl: 'postgres://db',
      clerkEmail: 'e2e@example.com',
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      code: 'TEST:CLERK_SECRET_KEY_MISSING',
      fix: 'Set CLERK_SECRET_KEY',
    });
    expect(support.formatFailureReport(failures)).toContain(
      '[TEST_RESET] Failure report (1):',
    );
  });

  it('throws a mapping error when required resolved env keys are absent', () => {
    const support = createSupport(createSharedE2EResetSupport);

    expect(() =>
      support.requireResolvedEnvOrThrow({
        databaseUrl: 'postgres://db',
      }),
    ).toThrow('[TEST:ENV_MAPPING_INCOMPLETE]');
  });

  it('maps Clerk transport and auth failures to deterministic errors', async () => {
    const support = createSupport(createSharedE2EResetSupport);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      support.resolveClerkUserIdByEmail({
        clerkSecretKey: 'sk_test',
        email: 'e2e@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'TEST:CLERK_API_UNAVAILABLE',
    });

    fetchSpy.mockResolvedValueOnce(new Response('denied', { status: 401 }));
    await expect(
      support.resolveClerkUserIdByEmail({
        clerkSecretKey: 'sk_test',
        email: 'e2e@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'TEST:CLERK_SECRET_KEY_INVALID',
    });

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 'clerk_user_123' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      support.resolveClerkUserIdByEmail({
        clerkSecretKey: 'sk_test',
        email: 'e2e@example.com',
      }),
    ).resolves.toBe('clerk_user_123');
  });

  it('resolves the app user id and closes the SQL client', async () => {
    const sqlClient = createSqlClient([[{ id: 'app_user_123' }]]);
    postgresMock.mockReturnValue(sqlClient);
    const support = createSupport(createSharedE2EResetSupport);

    await expect(
      support.resolveAppUserIdByClerkUserId({
        databaseUrl: 'postgres://db',
        clerkUserId: 'clerk_user_123',
      }),
    ).resolves.toBe('app_user_123');

    expect(postgresMock).toHaveBeenCalledWith('postgres://db', { max: 1 });
    expect(sqlClient.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('maps app user query failures to deterministic errors', async () => {
    const sqlClient = createSqlClient();
    sqlClient.mockRejectedValueOnce(new Error('db offline'));
    postgresMock.mockReturnValue(sqlClient);
    const support = createSupport(createSharedE2EResetSupport);

    await expect(
      support.resolveAppUserIdByClerkUserId({
        databaseUrl: 'postgres://db',
        clerkUserId: 'clerk_user_123',
      }),
    ).rejects.toMatchObject({
      code: 'TEST:APP_USER_LOOKUP_FAILED',
    });
    expect(sqlClient.end).toHaveBeenCalledWith({ timeout: 5 });
  });
});
