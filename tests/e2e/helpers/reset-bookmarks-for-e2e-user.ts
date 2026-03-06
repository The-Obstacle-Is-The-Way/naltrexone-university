import postgres from 'postgres';
import { createSharedE2EResetSupport } from './e2e-reset-shared';

const BOOKMARK_BASELINE = {
  questionSlug: 'placeholder-01-naltrexone-mechanism',
  bookmarkCreatedAt: '2026-01-01T00:05:00.000Z',
} as const;

type RequiredEnvVar = {
  key: 'DATABASE_URL' | 'CLERK_SECRET_KEY' | 'E2E_CLERK_USER_USERNAME';
  code: string;
  message: string;
  fix: string;
};

const REQUIRED_ENV_VARS: readonly RequiredEnvVar[] = [
  {
    key: 'DATABASE_URL',
    code: 'E2E_BOOKMARK_RESET:DATABASE_URL_MISSING',
    message: 'DATABASE_URL is missing.',
    fix: 'Set DATABASE_URL in .env.local (dev) or repository secrets (CI).',
  },
  {
    key: 'CLERK_SECRET_KEY',
    code: 'E2E_BOOKMARK_RESET:CLERK_SECRET_KEY_MISSING',
    message: 'CLERK_SECRET_KEY is missing.',
    fix: 'Set CLERK_SECRET_KEY in .env.local or CI secrets.',
  },
  {
    key: 'E2E_CLERK_USER_USERNAME',
    code: 'E2E_BOOKMARK_RESET:E2E_CLERK_USER_USERNAME_MISSING',
    message: 'E2E_CLERK_USER_USERNAME is missing.',
    fix: 'Set E2E_CLERK_USER_USERNAME to the E2E Clerk user email.',
  },
] as const;

export class E2EBookmarkResetError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fix: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'E2EBookmarkResetError';
  }
}

export type BookmarkQuestionFixtures = {
  placeholder01Id: string;
};

export type ResetBookmarksForE2EUserServices = {
  ensurePlaceholderQuestionPublished: (input: {
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
  resolveBookmarkQuestionFixture: (input: {
    databaseUrl: string;
  }) => Promise<BookmarkQuestionFixtures>;
  resetBookmarksToDeterministicBaseline: (input: {
    databaseUrl: string;
    userId: string;
    questionFixtures: BookmarkQuestionFixtures;
  }) => Promise<void>;
  verifyDeterministicBookmarkBaseline: (input: {
    databaseUrl: string;
    userId: string;
    questionFixtures: BookmarkQuestionFixtures;
  }) => Promise<void>;
};

type ResetBookmarksForE2EUserInput = {
  env?: NodeJS.ProcessEnv;
  services?: Partial<ResetBookmarksForE2EUserServices>;
};

const createBookmarkResetError = (
  code: string,
  message: string,
  fix: string,
  options?: ErrorOptions,
) => new E2EBookmarkResetError(code, message, fix, options);

const sharedResetSupport = createSharedE2EResetSupport({
  createError: createBookmarkResetError,
  requiredEnvVars: REQUIRED_ENV_VARS,
  failureReportLabel: '[E2E_BOOKMARK_RESET] Bookmark baseline reset failed',
  internalEnvMappingError: {
    code: 'E2E_BOOKMARK_RESET:ENV_MAPPING_INCOMPLETE',
    fix: 'Check resolveRequiredEnv() mappings for DATABASE_URL, CLERK_SECRET_KEY, and E2E_CLERK_USER_USERNAME.',
  },
  clerkApiUnavailableError: {
    code: 'E2E_BOOKMARK_RESET:CLERK_API_UNAVAILABLE',
    message: 'Clerk API request failed while resolving the E2E user.',
    fix: 'Retry after Clerk/API network recovery; do not change secrets until availability is restored.',
  },
  clerkSecretKeyInvalidError: {
    code: 'E2E_BOOKMARK_RESET:CLERK_SECRET_KEY_INVALID',
    message: 'Clerk rejected CLERK_SECRET_KEY while resolving the E2E user.',
    fix: 'Set CLERK_SECRET_KEY in .env.local or CI secrets.',
  },
  appUserLookupFailedError: {
    code: 'E2E_BOOKMARK_RESET:DATABASE_QUERY_FAILED',
    message: 'Failed to resolve the E2E app user row by Clerk user id.',
    fix: 'Verify DATABASE_URL connectivity and run pnpm db:migrate.',
  },
});

const defaultServices: ResetBookmarksForE2EUserServices = {
  ensurePlaceholderQuestionPublished: async ({ databaseUrl }) => {
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      const rows = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS "count"
        FROM questions
        WHERE slug = ${BOOKMARK_BASELINE.questionSlug}
      `;
      const count = Number.parseInt(rows[0]?.count ?? '0', 10);

      if (count < 1) {
        throw new E2EBookmarkResetError(
          'E2E_BOOKMARK_RESET:BOOKMARK_QUESTION_FIXTURE_MISSING',
          'Required placeholder bookmark question fixture was not found in the active database.',
          `Run SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed and ensure ${BOOKMARK_BASELINE.questionSlug} exists.`,
        );
      }

      await sql`
        UPDATE questions
        SET
          status = 'published',
          updated_at = now()
        WHERE slug = ${BOOKMARK_BASELINE.questionSlug}
          AND status <> 'published'
      `;
    } catch (error) {
      if (error instanceof E2EBookmarkResetError) {
        throw error;
      }

      throw new E2EBookmarkResetError(
        'E2E_BOOKMARK_RESET:PLACEHOLDER_FIXTURE_SYNC_FAILED',
        'Failed to ensure the placeholder bookmark question fixture is published.',
        'Verify DATABASE_URL connectivity and schema, then rerun the bookmark reset helper.',
      );
    } finally {
      try {
        await sql.end({ timeout: 5 });
      } catch {
        // Ignore shutdown errors in reset teardown.
      }
    }
  },

  resolveClerkUserIdByEmail: sharedResetSupport.resolveClerkUserIdByEmail,
  resolveAppUserIdByClerkUserId:
    sharedResetSupport.resolveAppUserIdByClerkUserId,

  resolveBookmarkQuestionFixture: async ({ databaseUrl }) => {
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      const rows = await sql<{ id: string }[]>`
        SELECT id
        FROM questions
        WHERE slug = ${BOOKMARK_BASELINE.questionSlug}
          AND status = 'published'
        LIMIT 1
      `;
      const placeholder01Id = rows[0]?.id;

      if (!placeholder01Id) {
        throw new E2EBookmarkResetError(
          'E2E_BOOKMARK_RESET:BOOKMARK_QUESTION_FIXTURE_MISSING',
          'The placeholder bookmark question fixture is missing or unpublished.',
          `Ensure ${BOOKMARK_BASELINE.questionSlug} exists with status=published.`,
        );
      }

      return { placeholder01Id };
    } catch (error) {
      if (error instanceof E2EBookmarkResetError) {
        throw error;
      }

      throw new E2EBookmarkResetError(
        'E2E_BOOKMARK_RESET:DATABASE_QUERY_FAILED',
        'Failed to resolve the placeholder bookmark question fixture.',
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

  resetBookmarksToDeterministicBaseline: async ({
    databaseUrl,
    userId,
    questionFixtures,
  }) => {
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe('DELETE FROM bookmarks WHERE user_id = $1', [userId]);
        await tx.unsafe(
          `
          INSERT INTO bookmarks (
            user_id,
            question_id,
            created_at
          )
          VALUES ($1, $2, $3)
          `,
          [
            userId,
            questionFixtures.placeholder01Id,
            BOOKMARK_BASELINE.bookmarkCreatedAt,
          ],
        );
      });
    } catch {
      throw new E2EBookmarkResetError(
        'E2E_BOOKMARK_RESET:DATABASE_MUTATION_FAILED',
        'Failed to reset E2E bookmark rows to the deterministic baseline.',
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

  verifyDeterministicBookmarkBaseline: async ({
    databaseUrl,
    userId,
    questionFixtures,
  }) => {
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      const rows = await sql<
        {
          bookmarkCount: number;
          placeholderBookmarkCount: number;
        }[]
      >`
        SELECT
          (
            SELECT COUNT(*)::int
            FROM bookmarks
            WHERE user_id = ${userId}
          ) AS "bookmarkCount",
          (
            SELECT COUNT(*)::int
            FROM bookmarks
            WHERE user_id = ${userId}
              AND question_id = ${questionFixtures.placeholder01Id}
          ) AS "placeholderBookmarkCount"
      `;

      const baseline = rows[0];
      const bookmarkCount = baseline?.bookmarkCount ?? 0;
      const placeholderBookmarkCount = baseline?.placeholderBookmarkCount ?? 0;

      if (bookmarkCount !== 1 || placeholderBookmarkCount !== 1) {
        throw new E2EBookmarkResetError(
          'E2E_BOOKMARK_RESET:BASELINE_STATE_INCOMPLETE',
          'Deterministic E2E bookmark baseline verification failed after reset.',
          'Verify the helper deletes all existing bookmarks and inserts exactly one bookmark for placeholder-01.',
        );
      }
    } catch (error) {
      if (error instanceof E2EBookmarkResetError) {
        throw error;
      }

      throw new E2EBookmarkResetError(
        'E2E_BOOKMARK_RESET:DATABASE_QUERY_FAILED',
        'Failed to verify the deterministic E2E bookmark baseline.',
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
};

export async function resetBookmarksForE2EUser(
  input: ResetBookmarksForE2EUserInput = {},
): Promise<void> {
  const env = input.env ?? process.env;
  const services: ResetBookmarksForE2EUserServices = {
    ...defaultServices,
    ...input.services,
  };

  const failures: E2EBookmarkResetError[] = [];
  const resolvedEnv = sharedResetSupport.resolveRequiredEnv(env, failures);

  if (failures.length > 0) {
    throw new Error(sharedResetSupport.formatFailureReport(failures));
  }

  const { databaseUrl, clerkSecretKey, clerkEmail } =
    sharedResetSupport.requireResolvedEnvOrThrow(resolvedEnv);

  try {
    await services.ensurePlaceholderQuestionPublished({ databaseUrl });

    const clerkUserId = await services.resolveClerkUserIdByEmail({
      clerkSecretKey,
      email: clerkEmail,
    });

    if (!clerkUserId) {
      throw new E2EBookmarkResetError(
        'E2E_BOOKMARK_RESET:CLERK_USER_NOT_FOUND',
        `Clerk user "${clerkEmail}" was not found.`,
        'Create that user in Clerk Dashboard or update E2E_CLERK_USER_USERNAME.',
      );
    }

    const appUserId = await services.resolveAppUserIdByClerkUserId({
      databaseUrl,
      clerkUserId,
    });

    if (!appUserId) {
      throw new E2EBookmarkResetError(
        'E2E_BOOKMARK_RESET:APP_USER_NOT_FOUND',
        `No app user row exists for Clerk user "${clerkUserId}".`,
        'Run seedTestSubscription() before this helper so the app user row exists.',
      );
    }

    const questionFixtures = await services.resolveBookmarkQuestionFixture({
      databaseUrl,
    });

    await services.resetBookmarksToDeterministicBaseline({
      databaseUrl,
      userId: appUserId,
      questionFixtures,
    });

    await services.verifyDeterministicBookmarkBaseline({
      databaseUrl,
      userId: appUserId,
      questionFixtures,
    });
  } catch (error) {
    if (error instanceof E2EBookmarkResetError) {
      throw new Error(sharedResetSupport.formatFailureReport([error]), {
        cause: error,
      });
    }

    throw new Error(
      sharedResetSupport.formatFailureReport([
        createBookmarkResetError(
          'E2E_BOOKMARK_RESET:UNEXPECTED',
          `Unexpected bookmark reset error: ${String(error)}`,
          'Inspect the stack trace and fix the bookmark reset helper or external dependency.',
        ),
      ]),
      { cause: error },
    );
  }
}
