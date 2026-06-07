import postgres from 'postgres';
import Stripe from 'stripe';
import migrationJournal from '../../../db/migrations/meta/_journal.json';

export const CLERK_API_BASE = 'https://api.clerk.com/v1';
export const CLERK_API_TIMEOUT_MS = 15_000;

type CredentialValidator = {
  id: 'database' | 'clerk' | 'stripe';
  run: () => Promise<void>;
};

type RequiredEnvVar = {
  key:
    | 'DATABASE_URL'
    | 'CLERK_SECRET_KEY'
    | 'E2E_CLERK_USER_USERNAME'
    | 'E2E_CLERK_USER_PASSWORD'
    | 'STRIPE_SECRET_KEY'
    | 'NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY';
  code: string;
  message: string;
  fix: string;
};

export class CredentialValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fix: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CredentialValidationError';
  }
}

export type CredentialHealthCheckServices = {
  checkDatabaseConnectivity: (sql: postgres.Sql) => Promise<void>;
  verifyMigrationLedger: (sql: postgres.Sql) => Promise<void>;
  verifyIdempotencySchema: (sql: postgres.Sql) => Promise<void>;
  resolveClerkUserId: (input: {
    clerkSecretKey: string;
    email: string;
  }) => Promise<string | null>;
  verifyClerkPassword: (input: {
    clerkSecretKey: string;
    userId: string;
    password: string;
  }) => Promise<boolean>;
  verifyStripeSecretKey: (stripe: Stripe) => Promise<void>;
  verifyStripePriceId: (input: {
    stripe: Stripe;
    priceId: string;
  }) => Promise<void>;
};

type RunCredentialHealthCheckInput = {
  env?: NodeJS.ProcessEnv;
  services?: Partial<CredentialHealthCheckServices>;
};

type ResolvedEnv = {
  databaseUrl?: string;
  clerkSecretKey?: string;
  clerkEmail?: string;
  clerkPassword?: string;
  stripeSecretKey?: string;
  stripeMonthlyPriceId?: string;
};

export type MigrationJournalEntry = {
  idx: number;
  tag: string;
  when: number;
};

type MigrationLedgerCreatedAt = number | string | bigint | null | undefined;

const SCHEMA_DRIFT_MIGRATIONS_CODE = 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATIONS';
const SCHEMA_DRIFT_MIGRATIONS_FIX =
  'For local runs, confirm .env.local points at the intended non-production database, then run: DATABASE_URL="<verified target>" pnpm db:migrate';

const MIGRATION_JOURNAL_ENTRIES: readonly MigrationJournalEntry[] =
  migrationJournal.entries.map(({ idx, tag, when }) => ({
    idx,
    tag,
    when,
  }));

const REQUIRED_ENV_VARS: readonly RequiredEnvVar[] = [
  {
    key: 'DATABASE_URL',
    code: 'E2E_PREFLIGHT:DATABASE_URL_MISSING',
    message: 'DATABASE_URL is missing.',
    fix: 'Set DATABASE_URL in .env.local (dev) or repository secrets (CI).',
  },
  {
    key: 'CLERK_SECRET_KEY',
    code: 'E2E_PREFLIGHT:CLERK_SECRET_KEY_MISSING',
    message: 'CLERK_SECRET_KEY is missing.',
    fix: 'Set CLERK_SECRET_KEY in .env.local or CI secrets.',
  },
  {
    key: 'E2E_CLERK_USER_USERNAME',
    code: 'E2E_PREFLIGHT:E2E_CLERK_USER_USERNAME_MISSING',
    message: 'E2E_CLERK_USER_USERNAME is missing.',
    fix: 'Set E2E_CLERK_USER_USERNAME to the E2E Clerk user email.',
  },
  {
    key: 'E2E_CLERK_USER_PASSWORD',
    code: 'E2E_PREFLIGHT:E2E_CLERK_USER_PASSWORD_MISSING',
    message: 'E2E_CLERK_USER_PASSWORD is missing.',
    fix: 'Set E2E_CLERK_USER_PASSWORD to match the Clerk E2E user password.',
  },
  {
    key: 'STRIPE_SECRET_KEY',
    code: 'E2E_PREFLIGHT:STRIPE_SECRET_KEY_MISSING',
    message: 'STRIPE_SECRET_KEY is missing.',
    fix: 'Set STRIPE_SECRET_KEY in .env.local or CI secrets.',
  },
  {
    key: 'NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY',
    code: 'E2E_PREFLIGHT:STRIPE_MONTHLY_PRICE_ID_MISSING',
    message: 'NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY is missing.',
    fix: 'Set NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY to a valid Stripe test price ID.',
  },
] as const;

export type ClerkUserListResponse =
  | Array<{ id?: string }>
  | { data?: Array<{ id?: string }> };

export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const timeoutController = new AbortController();
  const callerSignal = init.signal;
  const abortForTimeout = () => timeoutController.abort();
  const abortFromCaller = () => timeoutController.abort(callerSignal?.reason);
  const timeout = setTimeout(abortForTimeout, timeoutMs);

  if (callerSignal?.aborted) {
    timeoutController.abort(callerSignal.reason);
  } else if (callerSignal) {
    callerSignal.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: timeoutController.signal });
  } finally {
    clearTimeout(timeout);
    if (callerSignal) {
      callerSignal.removeEventListener('abort', abortFromCaller);
    }
  }
}

export function computeMissingMigrations(
  journalEntries: readonly MigrationJournalEntry[],
  appliedCreatedAt: readonly MigrationLedgerCreatedAt[],
): string[] {
  const appliedMigrationTimes = new Set(
    appliedCreatedAt
      .map((createdAt) => Number(createdAt))
      .filter((createdAt) => Number.isFinite(createdAt)),
  );

  return journalEntries
    .filter((entry) => !appliedMigrationTimes.has(entry.when))
    .map((entry) => entry.tag);
}

export function formatSchemaDriftMessage(
  missingMigrationTags: readonly string[],
): string {
  return `The database used by E2E is behind the repo migration journal. Missing migrations: ${missingMigrationTags.join(', ')}.`;
}

function createSchemaDriftMigrationsError(
  missingMigrationTags: readonly string[],
  options?: ErrorOptions,
): CredentialValidationError {
  return new CredentialValidationError(
    SCHEMA_DRIFT_MIGRATIONS_CODE,
    formatSchemaDriftMessage(missingMigrationTags),
    SCHEMA_DRIFT_MIGRATIONS_FIX,
    options,
  );
}

function isMissingMigrationLedgerError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === '3F000' || code === '42P01';
}

export async function verifyMigrationLedger(
  sql: postgres.Sql,
  journalEntries: readonly MigrationJournalEntry[] = MIGRATION_JOURNAL_ENTRIES,
): Promise<void> {
  try {
    const appliedMigrations = await sql<
      { createdAt: number | string | bigint }[]
    >`
      SELECT created_at AS "createdAt"
      FROM drizzle.__drizzle_migrations
    `;
    const missingMigrationTags = computeMissingMigrations(
      journalEntries,
      appliedMigrations.map((migration) => migration.createdAt),
    );

    if (missingMigrationTags.length > 0) {
      throw createSchemaDriftMigrationsError(missingMigrationTags);
    }
  } catch (error) {
    if (error instanceof CredentialValidationError) {
      throw error;
    }

    if (isMissingMigrationLedgerError(error)) {
      throw createSchemaDriftMigrationsError(
        journalEntries.map((entry) => entry.tag),
        { cause: error instanceof Error ? error : undefined },
      );
    }

    throw new CredentialValidationError(
      SCHEMA_DRIFT_MIGRATIONS_CODE,
      'Unable to verify the Drizzle migration ledger.',
      SCHEMA_DRIFT_MIGRATIONS_FIX,
      { cause: error instanceof Error ? error : undefined },
    );
  }
}

const defaultServices: CredentialHealthCheckServices = {
  checkDatabaseConnectivity: async (sql) => {
    try {
      await sql`SELECT 1`;
    } catch {
      throw new CredentialValidationError(
        'E2E_PREFLIGHT:DATABASE_CONNECT_FAILED',
        'Cannot connect to Postgres with DATABASE_URL.',
        'Verify Neon/Postgres URL, credentials, and network reachability.',
      );
    }
  },
  verifyMigrationLedger,
  verifyIdempotencySchema: async (sql) => {
    try {
      const rows = await sql<{ hasCompletedAt: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'idempotency_keys'
            AND column_name = 'completed_at'
        ) AS "hasCompletedAt"
      `;
      const hasCompletedAt = rows[0]?.hasCompletedAt === true;
      if (!hasCompletedAt) {
        throw new CredentialValidationError(
          'E2E_PREFLIGHT:SCHEMA_DRIFT_IDEMPOTENCY_KEYS',
          'Database schema drift detected: idempotency_keys.completed_at column is missing.',
          'Run migrations against this database (pnpm db:migrate).',
        );
      }
    } catch (error) {
      if (error instanceof CredentialValidationError) {
        throw error;
      }

      throw new CredentialValidationError(
        'E2E_PREFLIGHT:SCHEMA_DRIFT_IDEMPOTENCY_KEYS',
        'Unable to verify idempotency_keys schema contract.',
        'Ensure DATABASE_URL points to the intended database and run pnpm db:migrate.',
      );
    }
  },

  resolveClerkUserId: async ({ clerkSecretKey, email }) => {
    const url = `${CLERK_API_BASE}/users?email_address=${encodeURIComponent(email)}&limit=1`;

    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        {
          headers: { Authorization: `Bearer ${clerkSecretKey}` },
        },
        CLERK_API_TIMEOUT_MS,
      );
    } catch {
      throw new CredentialValidationError(
        'E2E_PREFLIGHT:CLERK_API_UNAVAILABLE',
        'Clerk API request failed (5xx/timeout).',
        'Retry after Clerk/API network recovery; do not change secrets until availability is restored.',
      );
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new CredentialValidationError(
          'E2E_PREFLIGHT:CLERK_SECRET_KEY_INVALID',
          'Clerk rejected CLERK_SECRET_KEY.',
          'Set CLERK_SECRET_KEY in .env.local or CI secrets.',
        );
      }

      throw new CredentialValidationError(
        'E2E_PREFLIGHT:CLERK_API_UNAVAILABLE',
        `Clerk API request failed with status ${response.status}.`,
        'Retry after Clerk/API network recovery; do not change secrets until availability is restored.',
      );
    }

    const payload = (await response.json()) as ClerkUserListResponse;
    const users = Array.isArray(payload) ? payload : (payload.data ?? []);
    const firstUser = users[0];
    if (!firstUser?.id) return null;
    return firstUser.id;
  },

  verifyClerkPassword: async ({ clerkSecretKey, userId, password }) => {
    const url = `${CLERK_API_BASE}/users/${userId}/verify_password`;

    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${clerkSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password }),
        },
        CLERK_API_TIMEOUT_MS,
      );
    } catch {
      throw new CredentialValidationError(
        'E2E_PREFLIGHT:CLERK_API_UNAVAILABLE',
        'Clerk API request failed (5xx/timeout).',
        'Retry after Clerk/API network recovery; do not change secrets until availability is restored.',
      );
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new CredentialValidationError(
          'E2E_PREFLIGHT:CLERK_SECRET_KEY_INVALID',
          'Clerk rejected CLERK_SECRET_KEY.',
          'Set CLERK_SECRET_KEY in .env.local or CI secrets.',
        );
      }

      const responseBody = await response.text();
      if (
        response.status === 400 ||
        response.status === 422 ||
        /password/i.test(responseBody)
      ) {
        return false;
      }

      throw new CredentialValidationError(
        'E2E_PREFLIGHT:CLERK_API_UNAVAILABLE',
        `Clerk password verification failed with status ${response.status}.`,
        'Retry after Clerk/API network recovery; do not change secrets until availability is restored.',
      );
    }

    const payload = (await response.json()) as { verified?: boolean };
    return payload.verified === true;
  },

  verifyStripeSecretKey: async (stripe) => {
    try {
      await stripe.accounts.retrieve(null);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeAuthenticationError) {
        throw new CredentialValidationError(
          'E2E_PREFLIGHT:STRIPE_SECRET_KEY_INVALID',
          'Stripe rejected STRIPE_SECRET_KEY.',
          'Use a valid Stripe test secret key (sk_test_...).',
          { cause: error },
        );
      }

      throw new CredentialValidationError(
        'E2E_PREFLIGHT:STRIPE_API_UNAVAILABLE',
        'Stripe API request failed while validating STRIPE_SECRET_KEY.',
        'Retry after Stripe/API network recovery; do not change secrets until availability is restored.',
        { cause: error instanceof Error ? error : undefined },
      );
    }
  },

  verifyStripePriceId: async ({ stripe, priceId }) => {
    try {
      await stripe.prices.retrieve(priceId);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeAuthenticationError) {
        throw new CredentialValidationError(
          'E2E_PREFLIGHT:STRIPE_SECRET_KEY_INVALID',
          'Stripe rejected STRIPE_SECRET_KEY.',
          'Use a valid Stripe test secret key (sk_test_...).',
          { cause: error },
        );
      }

      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        throw new CredentialValidationError(
          'E2E_PREFLIGHT:STRIPE_MONTHLY_PRICE_ID_INVALID',
          `Stripe price "${priceId}" was not found.`,
          'Update NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY to an existing test-mode price ID.',
          { cause: error },
        );
      }

      throw new CredentialValidationError(
        'E2E_PREFLIGHT:STRIPE_API_UNAVAILABLE',
        `Stripe API request failed while validating price "${priceId}".`,
        'Retry after Stripe/API network recovery; do not change secrets until availability is restored.',
        { cause: error instanceof Error ? error : undefined },
      );
    }
  },
};

function resolveRequiredEnv(
  env: NodeJS.ProcessEnv,
  failures: CredentialValidationError[],
): ResolvedEnv {
  const resolved: ResolvedEnv = {};

  for (const required of REQUIRED_ENV_VARS) {
    const value = env[required.key];
    if (!value || value.trim().length === 0) {
      failures.push(
        new CredentialValidationError(
          required.code,
          required.message,
          required.fix,
        ),
      );
      continue;
    }

    const trimmed = value.trim();
    if (required.key === 'DATABASE_URL') resolved.databaseUrl = trimmed;
    if (required.key === 'CLERK_SECRET_KEY') resolved.clerkSecretKey = trimmed;
    if (required.key === 'E2E_CLERK_USER_USERNAME')
      resolved.clerkEmail = trimmed;
    if (required.key === 'E2E_CLERK_USER_PASSWORD')
      resolved.clerkPassword = trimmed;
    if (required.key === 'STRIPE_SECRET_KEY')
      resolved.stripeSecretKey = trimmed;
    if (required.key === 'NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY') {
      resolved.stripeMonthlyPriceId = trimmed;
    }
  }

  return resolved;
}

function buildValidators(
  env: ResolvedEnv,
  services: CredentialHealthCheckServices,
): CredentialValidator[] {
  const validators: CredentialValidator[] = [];

  if (env.databaseUrl) {
    const databaseUrl = env.databaseUrl;
    validators.push({
      id: 'database',
      run: async () => {
        const sql = postgres(databaseUrl, { max: 1 });
        try {
          await services.checkDatabaseConnectivity(sql);
          await services.verifyMigrationLedger(sql);
          await services.verifyIdempotencySchema(sql);
        } finally {
          try {
            await sql.end({ timeout: 5 });
          } catch {
            // Ignore shutdown errors in preflight teardown.
          }
        }
      },
    });
  }

  if (env.clerkSecretKey && env.clerkEmail && env.clerkPassword) {
    const clerkSecretKey = env.clerkSecretKey;
    const clerkEmail = env.clerkEmail;
    const clerkPassword = env.clerkPassword;
    validators.push({
      id: 'clerk',
      run: async () => {
        const userId = await services.resolveClerkUserId({
          email: clerkEmail,
          clerkSecretKey,
        });

        if (!userId) {
          throw new CredentialValidationError(
            'E2E_PREFLIGHT:CLERK_USER_NOT_FOUND',
            `Clerk user "${clerkEmail}" was not found.`,
            'Create that user in Clerk Dashboard or update E2E_CLERK_USER_USERNAME.',
          );
        }

        const isVerified = await services.verifyClerkPassword({
          userId,
          password: clerkPassword,
          clerkSecretKey,
        });

        if (!isVerified) {
          throw new CredentialValidationError(
            'E2E_PREFLIGHT:CLERK_PASSWORD_INVALID',
            `Password for Clerk user "${clerkEmail}" is out of sync.`,
            'Reset password in Clerk and update E2E_CLERK_USER_PASSWORD to the same value.',
          );
        }
      },
    });
  }

  if (env.stripeSecretKey && env.stripeMonthlyPriceId) {
    const stripeSecretKey = env.stripeSecretKey;
    const stripeMonthlyPriceId = env.stripeMonthlyPriceId;
    validators.push({
      id: 'stripe',
      run: async () => {
        const stripe = new Stripe(stripeSecretKey);
        await services.verifyStripeSecretKey(stripe);
        await services.verifyStripePriceId({
          stripe,
          priceId: stripeMonthlyPriceId,
        });
      },
    });
  }

  return validators;
}

function formatFailureReport(failures: CredentialValidationError[]): string {
  const lines = [
    `[E2E_PREFLIGHT] Credential validation failed (${failures.length}):`,
    ...failures.flatMap((failure, index) => [
      `${index + 1}. [${failure.code}] ${failure.message}`,
      `   Fix: ${failure.fix}`,
    ]),
  ];
  return lines.join('\n');
}

export async function runE2ECredentialHealthCheck(
  input: RunCredentialHealthCheckInput = {},
): Promise<void> {
  const env = input.env ?? process.env;
  const services: CredentialHealthCheckServices = {
    ...defaultServices,
    ...input.services,
  };

  const failures: CredentialValidationError[] = [];
  const resolvedEnv = resolveRequiredEnv(env, failures);
  const validators = buildValidators(resolvedEnv, services);

  for (const validator of validators) {
    try {
      await validator.run();
    } catch (error) {
      if (error instanceof CredentialValidationError) {
        failures.push(error);
        continue;
      }

      failures.push(
        new CredentialValidationError(
          'E2E_PREFLIGHT:UNEXPECTED',
          `[${validator.id}] Unexpected preflight error: ${String(error)}`,
          'Inspect the stack trace above and fix the validator implementation or external dependency.',
          { cause: error instanceof Error ? error : undefined },
        ),
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(formatFailureReport(failures), {
      cause: failures,
    });
  }
}
