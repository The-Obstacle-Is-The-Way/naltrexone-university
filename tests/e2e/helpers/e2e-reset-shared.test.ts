import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fixtureAppUser123Id } = vi.hoisted(() => ({
  fixtureAppUser123Id: crypto.randomUUID(),
}));

const NON_SECRET_ERROR = 'connection terminated unexpectedly';
const SENSITIVE_ERROR_PARTS = [
  'postgresql://e2e_user:super-secret-password@ep-hidden-river-123456.us-east-1.aws.neon.tech/addiction_boards?sslmode=require',
  'ep-hidden-river-123456.us-east-1.aws.neon.tech',
  'super-secret-password',
  'sk_live_clerk_secret_123',
  'sk_live_stripe_secret_456',
  'ep-hidden-river-123456',
] as const;

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
type FormatNonSecretResetCause =
  typeof import('./e2e-reset-shared').formatNonSecretResetCause;

const REQUIRED_ENV_VARS = [
  {
    key: 'DATABASE_URL',
    code: 'TEST:DATABASE_URL_MISSING',
    message: 'DATABASE_URL missing',
    fix: 'Set DATABASE_URL',
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

function createSensitiveError(message = NON_SECRET_ERROR) {
  return new Error(
    `${message}; diagnostics=${SENSITIVE_ERROR_PARTS.join(' ')}`,
  );
}

function expectNoSensitiveParts(value: string) {
  for (const sensitivePart of SENSITIVE_ERROR_PARTS) {
    expect(value).not.toContain(sensitivePart);
  }
}

async function captureRejectedError(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return error as TestResetError;
  }

  throw new Error('Expected action to reject.');
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
    appUserLookupFailedError: {
      code: 'TEST:APP_USER_LOOKUP_FAILED',
      message: 'App user lookup failed',
      fix: 'Fix DB',
    },
  });
}

function createSqlClient(results: unknown[] = []) {
  const queuedResults = [...results];
  const sql = vi.fn(
    async (_strings: TemplateStringsArray, ..._values: unknown[]) =>
      queuedResults.shift() ?? [],
  );
  return Object.assign(sql, {
    end: vi.fn(async () => {}),
  });
}

describe('createSharedE2EResetSupport', () => {
  let createSharedE2EResetSupport: SharedSupportFactory;
  let formatNonSecretResetCause: FormatNonSecretResetCause;
  let postgresMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    postgresMock = vi.fn();
    vi.doMock('postgres', () => ({
      default: postgresMock,
    }));

    ({ createSharedE2EResetSupport, formatNonSecretResetCause } = await import(
      './e2e-reset-shared'
    ));
  });

  it('resolves required env values, trims whitespace, and formats missing env failures', () => {
    const support = createSupport(createSharedE2EResetSupport);
    const failures: TestResetError[] = [];

    const resolved = support.resolveRequiredEnv(
      {
        DATABASE_URL: '  postgres://db  ',
        E2E_CLERK_USER_USERNAME: '',
      } as unknown as NodeJS.ProcessEnv,
      failures,
    );

    expect(resolved).toEqual({ databaseUrl: 'postgres://db' });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      code: 'TEST:E2E_CLERK_USER_USERNAME_MISSING',
      fix: 'Set E2E_CLERK_USER_USERNAME',
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

  it('includes DATABASE_URL in mapping errors when the database URL is absent', () => {
    const support = createSupport(createSharedE2EResetSupport);

    expect(() =>
      support.requireResolvedEnvOrThrow({
        clerkEmail: 'e2e@example.com',
      }),
    ).toThrow('databaseUrl <- DATABASE_URL');
  });

  // DEBT-508: the reset finds the seeded user by email in the run's own
  // database, so a test's reset spends none of Clerk's shared rate budget.
  it('looks the app user up by email, as the query parameter', async () => {
    const sqlClient = createSqlClient([[{ id: fixtureAppUser123Id }]]);
    postgresMock.mockReturnValue(sqlClient);
    const support = createSupport(createSharedE2EResetSupport);

    await support.resolveAppUserIdByEmail({
      databaseUrl: 'postgres://db',
      email: 'e2e@example.com',
    });

    const [strings, ...values] = sqlClient.mock.calls[0] ?? [[]];
    expect(strings.join('?')).toMatch(/FROM users\s+WHERE email = \?/);
    expect(values).toEqual(['e2e@example.com']);
  });

  it('resolves the app user id and closes the SQL client', async () => {
    const sqlClient = createSqlClient([[{ id: fixtureAppUser123Id }]]);
    postgresMock.mockReturnValue(sqlClient);
    const support = createSupport(createSharedE2EResetSupport);

    await expect(
      support.resolveAppUserIdByEmail({
        databaseUrl: 'postgres://db',
        email: 'e2e@example.com',
      }),
    ).resolves.toBe(fixtureAppUser123Id);

    expect(postgresMock).toHaveBeenCalledWith('postgres://db', { max: 1 });
    expect(sqlClient.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('maps app user query failures to deterministic errors', async () => {
    const sqlClient = createSqlClient();
    sqlClient.mockRejectedValueOnce(new Error('db offline'));
    postgresMock.mockReturnValue(sqlClient);
    const support = createSupport(createSharedE2EResetSupport);

    await expect(
      support.resolveAppUserIdByEmail({
        databaseUrl: 'postgres://db',
        email: 'e2e@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'TEST:APP_USER_LOOKUP_FAILED',
    });
    expect(sqlClient.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('requires either a database URL or supplied SQL client for app-user lookup', async () => {
    const support = createSupport(createSharedE2EResetSupport);

    await expect(
      support.resolveAppUserIdByEmail({
        email: 'e2e@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'TEST:APP_USER_LOOKUP_FAILED',
      message:
        'Database URL or SQL client is required to resolve the E2E app user row.',
    });
    expect(postgresMock).not.toHaveBeenCalled();
  });

  it('formats non-error reset causes without leaking or overlong diagnostics', () => {
    const formatted = formatNonSecretResetCause(
      `${NON_SECRET_ERROR} ${SENSITIVE_ERROR_PARTS.join(' ')} ${'x'.repeat(300)}`,
    );

    expect(formatted).toContain(NON_SECRET_ERROR);
    expect(formatted.length).toBeLessThanOrEqual(180);
    expectNoSensitiveParts(formatted);
  });

  it('propagates app-user lookup failures with sanitized diagnostic context', async () => {
    const sourceError = createSensitiveError();
    const sqlClient = createSqlClient();
    sqlClient.mockRejectedValueOnce(sourceError);
    postgresMock.mockReturnValue(sqlClient);
    const support = createSupport(createSharedE2EResetSupport);

    const error = await captureRejectedError(() =>
      support.resolveAppUserIdByEmail({
        databaseUrl: 'postgres://db',
        email: 'e2e@example.com',
      }),
    );

    expect(error).toMatchObject({
      code: 'TEST:APP_USER_LOOKUP_FAILED',
    });
    expect(error.cause).toBe(sourceError);
    expect(error.message).toContain(NON_SECRET_ERROR);
    expectNoSensitiveParts(error.message);
    expect(sqlClient.end).toHaveBeenCalledWith({ timeout: 5 });
  });
});
