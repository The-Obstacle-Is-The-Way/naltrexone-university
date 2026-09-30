import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { onlyRow } from '@/scripts/seed/only-row';
import {
  appendQuestionRevision,
  choiceIdByLabel,
} from '@/scripts/seed/question-revision-writer';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { FakeAuthGateway } from '@/src/application/test-helpers/fakes';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to run integration tests. Did you forget to set it?',
  );
}
const integrationDatabaseUrl = databaseUrl;

const allowNonLocal = process.env.ALLOW_NON_LOCAL_DATABASE_URL === 'true';
const host = new URL(integrationDatabaseUrl).hostname;
const normalizedHost =
  host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
const isLocalhost =
  normalizedHost === 'localhost' ||
  normalizedHost === '127.0.0.1' ||
  normalizedHost === '::1';
if (!allowNonLocal && !isLocalhost) {
  throw new Error(
    `Refusing to run integration tests against non-local DATABASE_URL host "${host}". Set DATABASE_URL to a local Postgres (recommended: Docker) or export ALLOW_NON_LOCAL_DATABASE_URL=true to override.`,
  );
}

export function createIntegrationDb() {
  const sql = postgres(integrationDatabaseUrl, { max: 1 });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export type IntegrationDb = ReturnType<typeof createIntegrationDb>['db'];
export type IntegrationSql = ReturnType<typeof createIntegrationDb>['sql'];

export type CleanupState = {
  rateLimitKeys: string[];
  userIds: string[];
  questionIds: string[];
  tagIds: string[];
  stripeEventIds: string[];
};

export function createCleanupState(): CleanupState {
  return {
    rateLimitKeys: [],
    userIds: [],
    questionIds: [],
    tagIds: [],
    stripeEventIds: [],
  };
}

export async function cleanupAfterEach(
  db: IntegrationDb,
  cleanup: CleanupState,
): Promise<void> {
  if (cleanup.stripeEventIds.length > 0) {
    await db
      .delete(schema.stripeEvents)
      .where(inArray(schema.stripeEvents.id, cleanup.stripeEventIds));
  }

  if (cleanup.rateLimitKeys.length > 0) {
    await db
      .delete(schema.rateLimits)
      .where(inArray(schema.rateLimits.key, cleanup.rateLimitKeys));
  }

  if (cleanup.userIds.length > 0) {
    await db
      .delete(schema.users)
      .where(inArray(schema.users.id, cleanup.userIds));
  }

  if (cleanup.questionIds.length > 0) {
    await db
      .delete(schema.questions)
      .where(inArray(schema.questions.id, cleanup.questionIds));
  }

  if (cleanup.tagIds.length > 0) {
    await db.delete(schema.tags).where(inArray(schema.tags.id, cleanup.tagIds));
  }

  cleanup.userIds.length = 0;
  cleanup.questionIds.length = 0;
  cleanup.tagIds.length = 0;
  cleanup.stripeEventIds.length = 0;
  cleanup.rateLimitKeys.length = 0;
}

export async function closeConnection(sql: IntegrationSql): Promise<void> {
  await sql.end({ timeout: 5 });
}

export async function createUser(
  db: IntegrationDb,
  cleanup: CleanupState,
): Promise<{ id: string; email: string }> {
  const email = `it-${randomUUID()}@example.com`;
  const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;

  const [row] = await db
    .insert(schema.users)
    .values({ email, clerkUserId })
    .returning({ id: schema.users.id, email: schema.users.email });

  if (!row) {
    throw new Error('Failed to insert user');
  }

  cleanup.userIds.push(row.id);
  return row;
}

export function createAuthGateway(input: { id: string; email: string }) {
  return new FakeAuthGateway({
    id: input.id,
    email: input.email,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function createTag(
  db: DrizzleDb,
  cleanup: CleanupState,
  input: {
    slug: string;
    kind: schema.TagKind;
    name?: string;
  },
): Promise<{ id: string; slug: string }> {
  const [row] = await db
    .insert(schema.tags)
    .values({
      slug: input.slug,
      kind: input.kind,
      name: input.name ?? input.slug,
    })
    .returning({ id: schema.tags.id, slug: schema.tags.slug });

  if (!row) {
    throw new Error('Failed to insert tag');
  }

  cleanup.tagIds.push(row.id);
  return row;
}

export async function currentRevisionIdOf(
  db: DrizzleDb,
  questionId: string,
): Promise<string> {
  const [row] = await db
    .select({ id: schema.questions.currentRevisionId })
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId));
  if (!row) throw new Error(`No question ${questionId}`);
  return row.id;
}

// ADR-021: the revision a fixture attempt answered, as the app binds it: its
// selected choice's revision, else (an omitted answer) the question's current
// one. A question the seed has since revised keeps earlier choices on the
// earlier revision.
export async function answeredRevisionIdOf(
  db: DrizzleDb,
  questionId: string,
  selectedChoiceId: string | null | undefined,
): Promise<string> {
  if (!selectedChoiceId) return currentRevisionIdOf(db, questionId);
  const [choice] = await db
    .select({ revisionId: schema.choices.questionRevisionId })
    .from(schema.choices)
    .where(eq(schema.choices.id, selectedChoiceId));
  if (!choice) throw new Error(`No choice ${selectedChoiceId}`);
  return choice.revisionId;
}

// ADR-021 phase 2b: a second revision with its own choices, made current, as
// the seed appends it. Choice C is correct and D is not; the stem and
// difficulty change too.
export async function addCurrentRevision(
  db: DrizzleDb,
  questionId: string,
): Promise<{
  revisionId: string;
  correctChoiceId: string;
  incorrectChoiceId: string;
}> {
  const appended = await appendQuestionRevision(db, questionId, {
    stemMd: '# Revised stem',
    explanationMd: '# Revised explanation',
    referenceMd: 'Revised reference',
    difficulty: 'hard',
    choices: [
      {
        label: 'C',
        textMd: 'Revised C',
        isCorrect: true,
        explanationMd: null,
        sortOrder: 3,
      },
      {
        label: 'D',
        textMd: 'Revised D',
        isCorrect: false,
        explanationMd: null,
        sortOrder: 4,
      },
    ],
  });
  return {
    revisionId: appended.revisionId,
    correctChoiceId: choiceIdByLabel(appended, 'C'),
    incorrectChoiceId: choiceIdByLabel(appended, 'D'),
  };
}

export async function createQuestion(
  db: DrizzleDb,
  cleanup: CleanupState,
  input: {
    id?: string;
    slug: string;
    status: schema.QuestionStatus;
    difficulty: schema.QuestionDifficulty;
    createdAt?: Date;
    tagIds?: readonly string[];
  },
): Promise<{
  id: string;
  slug: string;
  correctChoiceId: string;
  incorrectChoiceId: string;
}> {
  const createdAt = input.createdAt ?? new Date();
  const updatedAt = createdAt;

  // ADR-021 phase 3: the question points at its first revision, written in
  // the same transaction; the deferred key is checked at commit.
  const revisionId = randomUUID();
  const questionValues: typeof schema.questions.$inferInsert = {
    slug: input.slug,
    status: input.status,
    currentRevisionId: revisionId,
    createdAt,
    updatedAt,
  };

  if (input.id) {
    questionValues.id = input.id;
  }

  const { question, appended } = await db.transaction(async (tx) => {
    const inserted = onlyRow(
      await tx
        .insert(schema.questions)
        .values(questionValues)
        .returning({ id: schema.questions.id }),
      'Failed to insert question',
    );
    // ADR-021: revision 1, written as the seed writes it.
    const revision = await appendQuestionRevision(
      tx,
      inserted.id,
      {
        stemMd: '# Stem',
        explanationMd: '# Explanation',
        referenceMd: null,
        difficulty: input.difficulty,
        choices: [
          {
            label: 'A',
            textMd: 'Choice A',
            isCorrect: false,
            explanationMd: null,
            sortOrder: 1,
          },
          {
            label: 'B',
            textMd: 'Choice B',
            isCorrect: true,
            explanationMd: null,
            sortOrder: 2,
          },
        ],
      },
      { revisionId, updatedAt },
    );
    return { question: inserted, appended: revision };
  });

  cleanup.questionIds.push(question.id);

  const correctChoiceId = choiceIdByLabel(appended, 'B');
  const incorrectChoiceId = choiceIdByLabel(appended, 'A');

  if (input.tagIds && input.tagIds.length > 0) {
    await db.insert(schema.questionTags).values(
      input.tagIds.map((tagId) => ({
        questionId: question.id,
        tagId,
      })),
    );
  }

  return {
    id: question.id,
    slug: input.slug,
    correctChoiceId,
    incorrectChoiceId,
  };
}
