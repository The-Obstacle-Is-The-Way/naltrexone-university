import postgres from 'postgres';

type SharedRequiredEnvKey = 'DATABASE_URL' | 'E2E_CLERK_USER_USERNAME';

export type SharedRequiredEnvVar = {
  key: SharedRequiredEnvKey;
  code: string;
  message: string;
  fix: string;
};

type SharedResolvedEnv = {
  databaseUrl?: string;
  clerkEmail?: string;
};

type SharedRequiredResolvedEnv = {
  databaseUrl: string;
  clerkEmail: string;
};

type SharedErrorLike = Error & {
  code: string;
  fix: string;
};

type SharedResetSql = ReturnType<typeof postgres>;

type SharedErrorFactory<E extends SharedErrorLike> = (
  code: string,
  message: string,
  fix: string,
  options?: ErrorOptions,
) => E;

type SharedErrorDefinition = {
  code: string;
  message: string;
  fix: string;
};

const MAX_CAUSE_EXCERPT_LENGTH = 180;

function truncateCauseExcerpt(value: string): string {
  if (value.length <= MAX_CAUSE_EXCERPT_LENGTH) return value;
  return `${value.slice(0, MAX_CAUSE_EXCERPT_LENGTH - 1)}…`;
}

export function formatNonSecretResetCause(error: unknown): string {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error);
  const redacted = rawMessage
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted database url]')
    .replace(
      /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:app|aws|cloud|com|dev|io|net|org|tech)\b/gi,
      '[redacted host]',
    )
    .replace(/\bep-[a-z0-9-]+-\d+\b/gi, '[redacted neon id]')
    .replace(
      /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_=-]+\b/g,
      '[redacted secret]',
    )
    .replace(/\bwhsec_[A-Za-z0-9_=-]+\b/g, '[redacted secret]')
    .replace(
      /\b\S*(?:secret|password|token|apikey|api_key)\S*\b/gi,
      '[redacted secret]',
    )
    .replace(/\b(?:password|pass|pwd)=\S+/gi, '[redacted credential]');

  return truncateCauseExcerpt(redacted);
}

export function appendNonSecretCause(message: string, error: unknown): string {
  return `${message} Cause: ${formatNonSecretResetCause(error)}`;
}

type CreateSharedE2EResetSupportInput<E extends SharedErrorLike> = {
  createError: SharedErrorFactory<E>;
  requiredEnvVars: readonly SharedRequiredEnvVar[];
  failureReportLabel: string;
  internalEnvMappingError: {
    code: string;
    fix: string;
  };
  appUserLookupFailedError: SharedErrorDefinition;
};

export function createSharedE2EResetSupport<E extends SharedErrorLike>({
  createError,
  requiredEnvVars,
  failureReportLabel,
  internalEnvMappingError,
  appUserLookupFailedError,
}: CreateSharedE2EResetSupportInput<E>) {
  function resolveRequiredEnv(
    env: NodeJS.ProcessEnv,
    failures: E[],
  ): SharedResolvedEnv {
    const resolved: SharedResolvedEnv = {};

    for (const required of requiredEnvVars) {
      const value = env[required.key];
      if (!value || value.trim().length === 0) {
        failures.push(
          createError(required.code, required.message, required.fix),
        );
        continue;
      }

      const trimmed = value.trim();
      if (required.key === 'DATABASE_URL') resolved.databaseUrl = trimmed;
      if (required.key === 'E2E_CLERK_USER_USERNAME') {
        resolved.clerkEmail = trimmed;
      }
    }

    return resolved;
  }

  function formatFailureReport(failures: E[]): string {
    const lines = [
      `${failureReportLabel} (${failures.length}):`,
      ...failures.flatMap((failure, index) => [
        `${index + 1}. [${failure.code}] ${failure.message}`,
        `   Fix: ${failure.fix}`,
      ]),
    ];
    return lines.join('\n');
  }

  function requireResolvedEnvOrThrow(
    resolvedEnv: SharedResolvedEnv,
  ): SharedRequiredResolvedEnv {
    const { databaseUrl, clerkEmail } = resolvedEnv;
    const missingMappedKeys: string[] = [];

    if (!databaseUrl) {
      missingMappedKeys.push('databaseUrl <- DATABASE_URL');
    }
    if (!clerkEmail) {
      missingMappedKeys.push('clerkEmail <- E2E_CLERK_USER_USERNAME');
    }

    if (!databaseUrl || !clerkEmail) {
      throw new Error(
        formatFailureReport([
          createError(
            internalEnvMappingError.code,
            `Internal env mapping is incomplete. Missing mapped keys: ${missingMappedKeys.join(', ')}.`,
            internalEnvMappingError.fix,
          ),
        ]),
      );
    }

    return { databaseUrl, clerkEmail };
  }

  // DEBT-508: global setup's seed writes the E2E user each run, so the reset
  // finds it by email here instead of asking Clerk before every test. Clerk
  // stores emails lowercased and the app writes Clerk's back, so case is
  // ignored.
  async function resolveAppUserIdByEmail(input: {
    databaseUrl?: string;
    sql?: SharedResetSql;
    email: string;
  }): Promise<string | null> {
    const shouldCloseSql = !input.sql;
    if (!input.sql && !input.databaseUrl) {
      throw createError(
        appUserLookupFailedError.code,
        'Database URL or SQL client is required to resolve the E2E app user row.',
        appUserLookupFailedError.fix,
      );
    }

    const sql = input.sql ?? postgres(input.databaseUrl ?? '', { max: 1 });
    try {
      const rows = await sql<{ id: string }[]>`
        SELECT id
        FROM users
        WHERE lower(email) = lower(${input.email})
        LIMIT 1
      `;
      return rows[0]?.id ?? null;
    } catch (error) {
      throw createError(
        appUserLookupFailedError.code,
        appendNonSecretCause(appUserLookupFailedError.message, error),
        appUserLookupFailedError.fix,
        { cause: error },
      );
    } finally {
      if (shouldCloseSql) {
        try {
          await sql.end({ timeout: 5 });
        } catch {
          // Ignore shutdown errors in helper teardown.
        }
      }
    }
  }

  return {
    resolveRequiredEnv,
    formatFailureReport,
    requireResolvedEnvOrThrow,
    resolveAppUserIdByEmail,
  };
}
