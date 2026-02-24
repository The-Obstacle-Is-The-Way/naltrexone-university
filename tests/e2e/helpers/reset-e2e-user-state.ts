import postgres from 'postgres';

const CLERK_API_BASE = 'https://api.clerk.com/v1';
const REQUIRED_QUESTION_SLUGS = {
  placeholder01: 'placeholder-01-naltrexone-mechanism',
  placeholder02: 'placeholder-02-buprenorphine-induction-timing',
} as const;

const DETERMINISTIC_BASELINE = {
  sessionId: '00000000-0000-4000-8000-000000000244',
  attemptInSessionId: '00000000-0000-4000-8000-000000000245',
  adhocAttemptId: '00000000-0000-4000-8000-000000000246',
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T00:02:00.000Z',
  answeredAtInSession: '2026-01-01T00:00:30.000Z',
  answeredAtAdhoc: '2026-01-01T00:03:00.000Z',
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

type ClerkUserListResponse =
  | Array<{ id?: string }>
  | { data?: Array<{ id?: string }> };

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

export type RequiredQuestionFixtures = {
  placeholder01Id: string;
  placeholder02Id: string;
};

export type RequiredChoiceFixtures = {
  placeholder01CorrectChoiceId: string;
  placeholder02IncorrectChoiceId: string;
};

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
  resolveRequiredQuestionFixtures: (input: {
    databaseUrl: string;
  }) => Promise<RequiredQuestionFixtures>;
  resolveRequiredChoiceFixtures: (input: {
    databaseUrl: string;
    questionIds: {
      placeholder01Id: string;
      placeholder02Id: string;
    };
  }) => Promise<RequiredChoiceFixtures>;
  seedDeterministicBaseline: (input: {
    databaseUrl: string;
    userId: string;
    questionFixtures: RequiredQuestionFixtures;
    choiceFixtures: RequiredChoiceFixtures;
  }) => Promise<void>;
  verifyDeterministicBaseline: (input: {
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
        WHERE slug IN (
          ${REQUIRED_QUESTION_SLUGS.placeholder01},
          ${REQUIRED_QUESTION_SLUGS.placeholder02}
        )
      `;
      const count = Number.parseInt(counts[0]?.count ?? '0', 10);
      const expectedCount = Object.values(REQUIRED_QUESTION_SLUGS).length;

      if (count < expectedCount) {
        throw new E2EUserStateResetError(
          'E2E_RESET:PLACEHOLDER_FIXTURES_MISSING',
          'Required placeholder question fixtures were not found in the active database.',
          `Run SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed and ensure ${REQUIRED_QUESTION_SLUGS.placeholder01} and ${REQUIRED_QUESTION_SLUGS.placeholder02} exist.`,
        );
      }

      await sql`
        UPDATE questions
        SET
          status = 'published',
          updated_at = now()
        WHERE slug IN (
          ${REQUIRED_QUESTION_SLUGS.placeholder01},
          ${REQUIRED_QUESTION_SLUGS.placeholder02}
        )
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

    const payload = (await response.json()) as ClerkUserListResponse;
    const users = Array.isArray(payload) ? payload : (payload.data ?? []);
    const firstUser = users[0];
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
        await tx.unsafe('DELETE FROM idempotency_keys WHERE user_id = $1', [
          userId,
        ]);
        await tx.unsafe('DELETE FROM attempts WHERE user_id = $1', [userId]);
        await tx.unsafe('DELETE FROM bookmarks WHERE user_id = $1', [userId]);
        await tx.unsafe('DELETE FROM practice_sessions WHERE user_id = $1', [
          userId,
        ]);
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

  resolveRequiredQuestionFixtures: async ({ databaseUrl }) => {
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      const rows = await sql<{ id: string; slug: string }[]>`
        SELECT id, slug
        FROM questions
        WHERE slug IN (
          ${REQUIRED_QUESTION_SLUGS.placeholder01},
          ${REQUIRED_QUESTION_SLUGS.placeholder02}
        )
          AND status = 'published'
      `;

      const fixtureBySlug = new Map(rows.map((row) => [row.slug, row.id]));
      const placeholder01Id = fixtureBySlug.get(
        REQUIRED_QUESTION_SLUGS.placeholder01,
      );
      const placeholder02Id = fixtureBySlug.get(
        REQUIRED_QUESTION_SLUGS.placeholder02,
      );

      if (!placeholder01Id || !placeholder02Id) {
        throw new E2EUserStateResetError(
          'E2E_RESET:REQUIRED_QUESTION_FIXTURE_MISSING',
          'One or more required E2E question fixtures are missing or unpublished.',
          `Ensure ${REQUIRED_QUESTION_SLUGS.placeholder01} and ${REQUIRED_QUESTION_SLUGS.placeholder02} exist with status=published.`,
        );
      }

      return {
        placeholder01Id,
        placeholder02Id,
      };
    } catch (error) {
      if (error instanceof E2EUserStateResetError) {
        throw error;
      }

      throw new E2EUserStateResetError(
        'E2E_RESET:DATABASE_QUERY_FAILED',
        'Failed to resolve required E2E question fixtures.',
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

  resolveRequiredChoiceFixtures: async ({ databaseUrl, questionIds }) => {
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      const rows = await sql<
        { id: string; questionId: string; isCorrect: boolean }[]
      >`
        SELECT
          id,
          question_id AS "questionId",
          is_correct AS "isCorrect"
        FROM choices
        WHERE question_id IN (${questionIds.placeholder01Id}, ${questionIds.placeholder02Id})
      `;

      const placeholder01CorrectChoiceId = rows.find(
        (row) =>
          row.questionId === questionIds.placeholder01Id && row.isCorrect,
      )?.id;
      const placeholder02IncorrectChoiceId = rows.find(
        (row) =>
          row.questionId === questionIds.placeholder02Id && !row.isCorrect,
      )?.id;

      if (!placeholder01CorrectChoiceId || !placeholder02IncorrectChoiceId) {
        throw new E2EUserStateResetError(
          'E2E_RESET:CHOICE_FIXTURE_MISSING',
          'Required E2E choice fixtures are missing for placeholder questions.',
          'Ensure placeholder-01 has at least one correct choice and placeholder-02 has at least one incorrect choice.',
        );
      }

      return {
        placeholder01CorrectChoiceId,
        placeholder02IncorrectChoiceId,
      };
    } catch (error) {
      if (error instanceof E2EUserStateResetError) {
        throw error;
      }

      throw new E2EUserStateResetError(
        'E2E_RESET:DATABASE_QUERY_FAILED',
        'Failed to resolve required E2E choice fixtures.',
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

  seedDeterministicBaseline: async ({
    databaseUrl,
    userId,
    questionFixtures,
    choiceFixtures,
  }) => {
    const sql = postgres(databaseUrl, { max: 1 });
    const questionStates = [
      {
        questionId: questionFixtures.placeholder01Id,
        markedForReview: false,
        latestSelectedChoiceId: choiceFixtures.placeholder01CorrectChoiceId,
        latestIsCorrect: true,
        latestAnsweredAt: DETERMINISTIC_BASELINE.answeredAtInSession,
      },
      {
        questionId: questionFixtures.placeholder02Id,
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
      },
    ];

    const paramsJson = {
      count: 2,
      tagSlugs: [],
      difficulties: [],
      questionIds: [
        questionFixtures.placeholder01Id,
        questionFixtures.placeholder02Id,
      ],
      questionStates,
    };

    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(
          `
          INSERT INTO practice_sessions (
            id,
            user_id,
            mode,
            params_json,
            started_at,
            ended_at
          )
          VALUES ($1, $2, 'tutor', $3::jsonb, $4, $5)
          `,
          [
            DETERMINISTIC_BASELINE.sessionId,
            userId,
            JSON.stringify(paramsJson),
            DETERMINISTIC_BASELINE.startedAt,
            DETERMINISTIC_BASELINE.endedAt,
          ],
        );

        await tx.unsafe(
          `
          INSERT INTO attempts (
            id,
            user_id,
            question_id,
            practice_session_id,
            selected_choice_id,
            is_correct,
            time_spent_seconds,
            answered_at
          )
          VALUES ($1, $2, $3, $4, $5, true, 30, $6)
          `,
          [
            DETERMINISTIC_BASELINE.attemptInSessionId,
            userId,
            questionFixtures.placeholder01Id,
            DETERMINISTIC_BASELINE.sessionId,
            choiceFixtures.placeholder01CorrectChoiceId,
            DETERMINISTIC_BASELINE.answeredAtInSession,
          ],
        );

        await tx.unsafe(
          `
          INSERT INTO attempts (
            id,
            user_id,
            question_id,
            practice_session_id,
            selected_choice_id,
            is_correct,
            time_spent_seconds,
            answered_at
          )
          VALUES ($1, $2, $3, NULL, $4, false, 45, $5)
          `,
          [
            DETERMINISTIC_BASELINE.adhocAttemptId,
            userId,
            questionFixtures.placeholder02Id,
            choiceFixtures.placeholder02IncorrectChoiceId,
            DETERMINISTIC_BASELINE.answeredAtAdhoc,
          ],
        );

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
            DETERMINISTIC_BASELINE.bookmarkCreatedAt,
          ],
        );
      });
    } catch {
      throw new E2EUserStateResetError(
        'E2E_RESET:DATABASE_MUTATION_FAILED',
        'Failed to seed deterministic E2E baseline state.',
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

  verifyDeterministicBaseline: async ({ databaseUrl, userId }) => {
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      const rows = await sql<
        {
          completedSessions: number;
          attemptCount: number;
          bookmarkCount: number;
        }[]
      >`
        SELECT
          (
            SELECT COUNT(*)::int
            FROM practice_sessions
            WHERE user_id = ${userId}
              AND ended_at IS NOT NULL
          ) AS "completedSessions",
          (
            SELECT COUNT(*)::int
            FROM attempts
            WHERE user_id = ${userId}
          ) AS "attemptCount",
          (
            SELECT COUNT(*)::int
            FROM bookmarks
            WHERE user_id = ${userId}
          ) AS "bookmarkCount"
      `;

      const baseline = rows[0];
      const completedSessions = baseline?.completedSessions ?? 0;
      const attemptCount = baseline?.attemptCount ?? 0;
      const bookmarkCount = baseline?.bookmarkCount ?? 0;

      if (completedSessions < 1 || attemptCount < 2 || bookmarkCount < 1) {
        throw new E2EUserStateResetError(
          'E2E_RESET:BASELINE_STATE_INCOMPLETE',
          'Deterministic E2E baseline verification failed after reset.',
          'Verify reset helper inserts completed session, attempts, and bookmark rows for the E2E user.',
        );
      }
    } catch (error) {
      if (error instanceof E2EUserStateResetError) {
        throw error;
      }

      throw new E2EUserStateResetError(
        'E2E_RESET:DATABASE_QUERY_FAILED',
        'Failed to verify deterministic E2E baseline state.',
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
      throw new E2EUserStateResetError(
        'E2E_RESET:CLERK_USER_NOT_FOUND',
        `Clerk user "${clerkEmail}" was not found.`,
        'Create that user in Clerk Dashboard or update E2E_CLERK_USER_USERNAME.',
      );
    }

    const appUserId = await services.resolveAppUserIdByClerkUserId({
      databaseUrl,
      clerkUserId,
    });

    if (!appUserId) {
      throw new E2EUserStateResetError(
        'E2E_RESET:APP_USER_NOT_FOUND',
        `No app user row exists for Clerk user "${clerkUserId}".`,
        'Run seedTestSubscription() before runE2EUserStateReset() in global setup so the user row exists.',
      );
    }

    await services.clearUserState({
      databaseUrl,
      userId: appUserId,
    });

    const questionFixtures = await services.resolveRequiredQuestionFixtures({
      databaseUrl,
    });
    const choiceFixtures = await services.resolveRequiredChoiceFixtures({
      databaseUrl,
      questionIds: {
        placeholder01Id: questionFixtures.placeholder01Id,
        placeholder02Id: questionFixtures.placeholder02Id,
      },
    });

    await services.seedDeterministicBaseline({
      databaseUrl,
      userId: appUserId,
      questionFixtures,
      choiceFixtures,
    });
    await services.verifyDeterministicBaseline({
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
      { cause: error },
    );
  }
}
