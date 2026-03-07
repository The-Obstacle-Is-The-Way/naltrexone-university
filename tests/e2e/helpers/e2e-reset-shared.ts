import postgres from 'postgres';
import {
  CLERK_API_BASE,
  CLERK_API_TIMEOUT_MS,
  type ClerkUserListResponse,
  fetchWithTimeout,
} from './credential-health-check';

type SharedRequiredEnvKey =
  | 'DATABASE_URL'
  | 'CLERK_SECRET_KEY'
  | 'E2E_CLERK_USER_USERNAME';

export type SharedRequiredEnvVar = {
  key: SharedRequiredEnvKey;
  code: string;
  message: string;
  fix: string;
};

type SharedResolvedEnv = {
  databaseUrl?: string;
  clerkSecretKey?: string;
  clerkEmail?: string;
};

type SharedRequiredResolvedEnv = {
  databaseUrl: string;
  clerkSecretKey: string;
  clerkEmail: string;
};

type SharedErrorLike = Error & {
  code: string;
  fix: string;
};

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

type CreateSharedE2EResetSupportInput<E extends SharedErrorLike> = {
  createError: SharedErrorFactory<E>;
  requiredEnvVars: readonly SharedRequiredEnvVar[];
  failureReportLabel: string;
  internalEnvMappingError: {
    code: string;
    fix: string;
  };
  clerkApiUnavailableError: SharedErrorDefinition;
  clerkSecretKeyInvalidError: SharedErrorDefinition;
  appUserLookupFailedError: SharedErrorDefinition;
};

export function createSharedE2EResetSupport<E extends SharedErrorLike>({
  createError,
  requiredEnvVars,
  failureReportLabel,
  internalEnvMappingError,
  clerkApiUnavailableError,
  clerkSecretKeyInvalidError,
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
      if (required.key === 'CLERK_SECRET_KEY')
        resolved.clerkSecretKey = trimmed;
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
    const { databaseUrl, clerkSecretKey, clerkEmail } = resolvedEnv;
    const missingMappedKeys: string[] = [];

    if (!databaseUrl) {
      missingMappedKeys.push('databaseUrl <- DATABASE_URL');
    }
    if (!clerkSecretKey) {
      missingMappedKeys.push('clerkSecretKey <- CLERK_SECRET_KEY');
    }
    if (!clerkEmail) {
      missingMappedKeys.push('clerkEmail <- E2E_CLERK_USER_USERNAME');
    }

    if (!databaseUrl || !clerkSecretKey || !clerkEmail) {
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

    return {
      databaseUrl,
      clerkSecretKey,
      clerkEmail,
    };
  }

  async function resolveClerkUserIdByEmail(input: {
    clerkSecretKey: string;
    email: string;
  }): Promise<string | null> {
    const url = `${CLERK_API_BASE}/users?email_address=${encodeURIComponent(input.email)}&limit=1`;

    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        { headers: { Authorization: `Bearer ${input.clerkSecretKey}` } },
        CLERK_API_TIMEOUT_MS,
      );
    } catch {
      throw createError(
        clerkApiUnavailableError.code,
        clerkApiUnavailableError.message,
        clerkApiUnavailableError.fix,
      );
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw createError(
          clerkSecretKeyInvalidError.code,
          clerkSecretKeyInvalidError.message,
          clerkSecretKeyInvalidError.fix,
        );
      }

      throw createError(
        clerkApiUnavailableError.code,
        `Clerk API request failed with status ${response.status}.`,
        clerkApiUnavailableError.fix,
      );
    }

    const payload = (await response.json()) as ClerkUserListResponse;
    const users = Array.isArray(payload) ? payload : (payload.data ?? []);
    const firstUser = users[0];
    if (!firstUser?.id) return null;
    return firstUser.id;
  }

  async function resolveAppUserIdByClerkUserId(input: {
    databaseUrl: string;
    clerkUserId: string;
  }): Promise<string | null> {
    const sql = postgres(input.databaseUrl, { max: 1 });
    try {
      const rows = await sql<{ id: string }[]>`
        SELECT id
        FROM users
        WHERE clerk_user_id = ${input.clerkUserId}
        LIMIT 1
      `;
      return rows[0]?.id ?? null;
    } catch {
      throw createError(
        appUserLookupFailedError.code,
        appUserLookupFailedError.message,
        appUserLookupFailedError.fix,
      );
    } finally {
      try {
        await sql.end({ timeout: 5 });
      } catch {
        // Ignore shutdown errors in helper teardown.
      }
    }
  }

  return {
    resolveRequiredEnv,
    formatFailureReport,
    requireResolvedEnvOrThrow,
    resolveClerkUserIdByEmail,
    resolveAppUserIdByClerkUserId,
  };
}
