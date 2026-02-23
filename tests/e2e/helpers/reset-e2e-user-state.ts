import postgres from 'postgres';

const CLERK_API_BASE = 'https://api.clerk.com/v1';

type RequiredEnvVar = {
  key: 'DATABASE_URL' | 'CLERK_SECRET_KEY' | 'E2E_CLERK_USER_USERNAME';
  code: string;
  message: string;
  fix: string;
};

const REQUIRED_ENV_VARS: readonly RequiredEnvVar[] = [
  {
    key: 'DATABASE_URL',
    code: 'E2E_RESET:DATABASE_URL_MISSING',
    message: 'DATABASE_URL is missing.',
    fix: 'Set DATABASE_URL in .env.local (dev) or repository secrets (CI).',
  },
  {
    key: 'CLERK_SECRET_KEY',
    code: 'E2E_RESET:CLERK_SECRET_KEY_MISSING',
    message: 'CLERK_SECRET_KEY is missing.',
    fix: 'Set CLERK_SECRET_KEY in .env.local or CI secrets.',
  },
  {
    key: 'E2E_CLERK_USER_USERNAME',
    code: 'E2E_RESET:E2E_CLERK_USER_USERNAME_MISSING',
    message: 'E2E_CLERK_USER_USERNAME is missing.',
    fix: 'Set E2E_CLERK_USER_USERNAME to the E2E Clerk user email.',
  },
] as const;

export class E2EUserStateResetError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fix: string,
  ) {
    super(message);
    this.name = 'E2EUserStateResetError';
  }
}

export type E2EUserStateResetServices = {
  ensurePlaceholderQuestionsPublished: (input: {
    databaseUrl: string;
  }) => Promise<void>;
  resolveClerkUserIdByEmail: (input: {
    clerkSecretKey: string;
    email: string;
  }) => Promise<string | null>;
  resolveAppUserIdByClerkUserId: (input: {
    databaseUrl: string;
    clerkUserId: string;
  }) => Promise<string | null>;
  clearUserState: (input: {
    databaseUrl: string;
    userId: string;
  }) => Promise<void>;
};

type RunE2EUserStateResetInput = {
  env?: NodeJS.ProcessEnv;
  services?: Partial<E2EUserStateResetServices>;
};

type ResolvedEnv = {
  databaseUrl?: string;
  clerkSecretKey?: string;
  clerkEmail?: string;
};

const defaultServices: E2EUserStateResetServices = {
  ensurePlaceholderQuestionsPublished: async ({ databaseUrl }) => {
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      const counts = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS "count"
        FROM questions
        WHERE slug LIKE 'placeholder-%'
      `;
      const count = Number.parseInt(counts[0]?.count ?? '0', 10);

      if (count === 0) {
        throw new E2EUserStateResetError(
          'E2E_RESET:PLACEHOLDER_FIXTURES_MISSING',
          'No placeholder question fixtures were found in the active database.',
          'Run SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed before running E2E.',
        );
      }

      await sql`
        UPDATE questions
        SET
          status = 'published',
          updated_at = now()
        WHERE slug LIKE 'placeholder-%'
          AND status <> 'published'
      `;
    } catch (error) {
      if (error instanceof E2EUserStateResetError) {
        throw error;
      }

      throw new E2EUserStateResetError(
        'E2E_RESET:PLACEHOLDER_FIXTURE_SYNC_FAILED',
        'Failed to ensure placeholder question fixtures are published.',
        'Verify DATABASE_URL connectivity and schema, then rerun E2E setup.',
      );
    } finally {
      try {
        await sql.end({ timeout: 5 });
      } catch {
        // Ignore shutdown errors in reset teardown.
      }
    }
  },

  resolveClerkUserIdByEmail: async ({ clerkSecretKey, email }) => {
    const url = `${CLERK_API_BASE}/users?email_address=${encodeURIComponent(email)}&limit=1`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${clerkSecretKey}` },
      });
    } catch {
      throw new E2EUserStateResetError(
        'E2E_RESET:CLERK_API_UNAVAILABLE',
        'Clerk API request failed while resolving E2E user.',
        'Retry after Clerk/API network recovery; do not change secrets until availability is restored.',
      );
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new E2EUserStateResetError(
          'E2E_RESET:CLERK_SECRET_KEY_INVALID',
          'Clerk rejected CLERK_SECRET_KEY while resolving E2E user.',
          'Set CLERK_SECRET_KEY in .env.local or CI secrets.',
        );
      }

      throw new E2EUserStateResetError(
        'E2E_RESET:CLERK_API_UNAVAILABLE',
        `Clerk API request failed with status ${response.status}.`,
        'Retry after Clerk/API network recovery; do not change secrets until availability is restored.',
      );
    }

    const payload = (await response.json()) as Array<{ id?: string }>;
    const firstUser = payload[0];
    if (!firstUser?.id) return null;
    return firstUser.id;
  },

  resolveAppUserIdByClerkUserId: async ({ databaseUrl, clerkUserId }) => {
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      const rows = await sql<{ id: string }[]>`
        SELECT id
        FROM users
        WHERE clerk_user_id = ${clerkUserId}
        LIMIT 1
      `;
      return rows[0]?.id ?? null;
    } catch {
      throw new E2EUserStateResetError(
        'E2E_RESET:DATABASE_QUERY_FAILED',
        'Failed to resolve E2E app user row by Clerk user id.',
        'Verify DATABASE_URL connectivity and run pnpm db:migrate.',
      );
    } finally {
      try {
        await sql.end({ timeout: 5 });
      } catch {
        // Ignore shutdown errors in reset teardown.
      }
    }
  },

  clearUserState: async ({ databaseUrl, userId }) => {
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM idempotency_keys WHERE user_id = ${userId}`;
        await tx`DELETE FROM attempts WHERE user_id = ${userId}`;
        await tx`DELETE FROM bookmarks WHERE user_id = ${userId}`;
        await tx`DELETE FROM practice_sessions WHERE user_id = ${userId}`;
      });
    } catch {
      throw new E2EUserStateResetError(
        'E2E_RESET:DATABASE_MUTATION_FAILED',
        'Failed to reset mutable E2E user state.',
        'Verify DATABASE_URL connectivity, schema, and table permissions.',
      );
    } finally {
      try {
        await sql.end({ timeout: 5 });
      } catch {
        // Ignore shutdown errors in reset teardown.
      }
    }
  },
};

function resolveRequiredEnv(
  env: NodeJS.ProcessEnv,
  failures: E2EUserStateResetError[],
): ResolvedEnv {
  const resolved: ResolvedEnv = {};

  for (const required of REQUIRED_ENV_VARS) {
    const value = env[required.key];
    if (!value || value.trim().length === 0) {
      failures.push(
        new E2EUserStateResetError(
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
  }

  return resolved;
}

function formatFailureReport(failures: E2EUserStateResetError[]): string {
  const lines = [
    `[E2E_RESET] E2E user-state reset failed (${failures.length}):`,
    ...failures.flatMap((failure, index) => [
      `${index + 1}. [${failure.code}] ${failure.message}`,
      `   Fix: ${failure.fix}`,
    ]),
  ];
  return lines.join('\n');
}

export async function runE2EUserStateReset(
  input: RunE2EUserStateResetInput = {},
): Promise<void> {
  const env = input.env ?? process.env;
  const services: E2EUserStateResetServices = {
    ...defaultServices,
    ...input.services,
  };

  const failures: E2EUserStateResetError[] = [];
  const resolvedEnv = resolveRequiredEnv(env, failures);

  if (failures.length > 0) {
    throw new Error(formatFailureReport(failures));
  }

  const databaseUrl = resolvedEnv.databaseUrl as string;
  const clerkSecretKey = resolvedEnv.clerkSecretKey as string;
  const clerkEmail = resolvedEnv.clerkEmail as string;

  try {
    await services.ensurePlaceholderQuestionsPublished({ databaseUrl });

    const clerkUserId = await services.resolveClerkUserIdByEmail({
      clerkSecretKey,
      email: clerkEmail,
    });

    if (!clerkUserId) {
      return;
    }

    const appUserId = await services.resolveAppUserIdByClerkUserId({
      databaseUrl,
      clerkUserId,
    });

    if (!appUserId) {
      return;
    }

    await services.clearUserState({
      databaseUrl,
      userId: appUserId,
    });
  } catch (error) {
    if (error instanceof E2EUserStateResetError) {
      throw new Error(formatFailureReport([error]));
    }

    throw new Error(
      formatFailureReport([
        new E2EUserStateResetError(
          'E2E_RESET:UNEXPECTED',
          `Unexpected reset error: ${String(error)}`,
          'Inspect stack trace and fix the reset helper or external dependency.',
        ),
      ]),
    );
  }
}
