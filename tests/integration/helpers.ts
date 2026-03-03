import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

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

export async function createTag(
  db: IntegrationDb,
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

export async function createQuestion(
  db: IntegrationDb,
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

  const questionValues: typeof schema.questions.$inferInsert = {
    slug: input.slug,
    stemMd: '# Stem',
    explanationMd: '# Explanation',
    status: input.status,
    difficulty: input.difficulty,
    createdAt,
    updatedAt,
  };

  if (input.id) {
    questionValues.id = input.id;
  }

  const [question] = await db
    .insert(schema.questions)
    .values(questionValues)
    .returning({ id: schema.questions.id });

  if (!question) {
    throw new Error('Failed to insert question');
  }

  cleanup.questionIds.push(question.id);

  const choices = await db
    .insert(schema.choices)
    .values([
      {
        questionId: question.id,
        label: 'A',
        textMd: 'Choice A',
        isCorrect: false,
        sortOrder: 1,
      },
      {
        questionId: question.id,
        label: 'B',
        textMd: 'Choice B',
        isCorrect: true,
        sortOrder: 2,
      },
    ])
    .returning({ id: schema.choices.id, isCorrect: schema.choices.isCorrect });

  const correctChoice = choices.find((choice) => choice.isCorrect);
  const incorrectChoice = choices.find((choice) => !choice.isCorrect);
  if (!correctChoice || !incorrectChoice) {
    throw new Error('Failed to insert choices');
  }

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
    correctChoiceId: correctChoice.id,
    incorrectChoiceId: incorrectChoice.id,
  };
}
