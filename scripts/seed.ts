import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { and, eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import fg from 'fast-glob';
import matter from 'gray-matter';
import postgres from 'postgres';
import * as schema from '../db/schema';
import {
  canonicalizeMarkdown,
  canonicalJsonString,
  parseMdxQuestionBody,
  sha256Hex,
} from '../lib/content/parseMdxQuestion';
import {
  FullQuestionSchema,
  QuestionFrontmatterSchema,
} from '../lib/content/schemas';
import { computeChoiceSyncPlan } from './seed-helpers';

type SeedTag = {
  slug: string;
  name: string;
  kind: schema.TagKind;
};

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

type SeedChoice = {
  label: string;
  text_md: string;
  is_correct: boolean;
  sort_order: number;
};

type SeedQuestionRep = {
  slug: string;
  stem_md: string;
  explanation_md: string;
  difficulty: schema.QuestionDifficulty;
  status: schema.QuestionStatus;
  choices: SeedChoice[];
  tags: SeedTag[];
};

function buildSeedRepFromFile(full: unknown): SeedQuestionRep {
  const parsed = FullQuestionSchema.parse(full);

  const sortedTags = [...parsed.frontmatter.tags].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
  const sortedChoices = [...parsed.frontmatter.choices].sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  return {
    slug: parsed.frontmatter.slug,
    stem_md: canonicalizeMarkdown(parsed.stemMd),
    explanation_md: canonicalizeMarkdown(parsed.explanationMd),
    difficulty: parsed.frontmatter.difficulty,
    status: parsed.frontmatter.status,
    tags: sortedTags.map((t) => ({
      slug: t.slug,
      name: t.name,
      kind: t.kind,
    })),
    choices: sortedChoices.map((c, index) => ({
      label: c.label,
      text_md: canonicalizeMarkdown(c.text),
      is_correct: c.correct,
      sort_order: index + 1,
    })),
  };
}

function buildSeedRepFromDb(
  question: schema.Question,
  choices: schema.Choice[],
  tags: SeedTag[],
): SeedQuestionRep {
  return {
    slug: question.slug,
    stem_md: canonicalizeMarkdown(question.stemMd),
    explanation_md: canonicalizeMarkdown(question.explanationMd),
    difficulty: question.difficulty,
    status: question.status,
    choices: [...choices]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        label: c.label,
        text_md: canonicalizeMarkdown(c.textMd),
        is_correct: c.isCorrect,
        sort_order: c.sortOrder,
      })),
    tags: [...tags].sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}

async function upsertTags(
  tx: PostgresJsDatabase<typeof schema>,
  incomingTags: SeedTag[],
): Promise<Map<string, { id: string } & SeedTag>> {
  const tagSlugs = incomingTags.map((t) => t.slug);

  const existing = tagSlugs.length
    ? await tx
        .select()
        .from(schema.tags)
        .where(inArray(schema.tags.slug, tagSlugs))
    : [];

  const bySlug = new Map(existing.map((t) => [t.slug, t]));

  for (const tag of incomingTags) {
    const found = bySlug.get(tag.slug);
    if (found) {
      if (found.name !== tag.name || found.kind !== tag.kind) {
        throw new Error(
          `Tag slug "${tag.slug}" already exists but differs (expected name="${tag.name}", kind="${tag.kind}"; got name="${found.name}", kind="${found.kind}")`,
        );
      }
      continue;
    }

    const [inserted] = await tx
      .insert(schema.tags)
      .values({
        slug: tag.slug,
        name: tag.name,
        kind: tag.kind,
      })
      .returning();

    if (!inserted) {
      throw new Error(`Failed to insert tag slug "${tag.slug}"`);
    }

    bySlug.set(inserted.slug, inserted);
  }

  return bySlug;
}

function parseFrontmatterOrThrow(data: unknown) {
  return QuestionFrontmatterSchema.parse(data);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required for db:seed');
}

const sql = postgres(databaseUrl, { max: 1 });
const db = drizzle(sql, { schema });

async function main(): Promise<void> {
  const files = await fg(['content/questions/**/*.mdx'], {
    onlyFiles: true,
    unique: true,
    absolute: true,
    dot: false,
  });

  if (files.length === 0) {
    throw new Error(
      'No question files found at content/questions/**/*.mdx. Seed requires at least one MDX file.',
    );
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const { data, content } = matter(raw);

    const frontmatter = parseFrontmatterOrThrow(data);
    const { stemMd, explanationMd } = parseMdxQuestionBody(content);

    const seedFromFile = buildSeedRepFromFile({
      frontmatter,
      stemMd,
      explanationMd,
    });

    const fileHash = sha256Hex(canonicalJsonString(seedFromFile));

    const existing = await db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.slug, seedFromFile.slug))
      .limit(1);
    const existingQuestion = existing.at(0);

    if (!existingQuestion) {
      await db.transaction(async (tx) => {
        const [createdQuestion] = await tx
          .insert(schema.questions)
          .values({
            slug: seedFromFile.slug,
            stemMd: seedFromFile.stem_md,
            explanationMd: seedFromFile.explanation_md,
            difficulty: seedFromFile.difficulty,
            status: seedFromFile.status,
          })
          .returning({ id: schema.questions.id });

        if (!createdQuestion) {
          throw new Error(
            `Failed to insert question for slug "${seedFromFile.slug}"`,
          );
        }

        await tx.insert(schema.choices).values(
          seedFromFile.choices.map((c) => ({
            questionId: createdQuestion.id,
            label: c.label,
            textMd: c.text_md,
            isCorrect: c.is_correct,
            sortOrder: c.sort_order,
          })),
        );

        const tagMap = await upsertTags(tx, seedFromFile.tags);
        await tx.insert(schema.questionTags).values(
          seedFromFile.tags.map((t) => ({
            questionId: createdQuestion.id,
            tagId:
              tagMap.get(t.slug)?.id ??
              (() => {
                throw new Error(`Missing tag id for slug "${t.slug}"`);
              })(),
          })),
        );
      });

      inserted += 1;
      continue;
    }

    const existingChoices = await db
      .select()
      .from(schema.choices)
      .where(eq(schema.choices.questionId, existingQuestion.id));

    const existingTags = await db
      .select({
        slug: schema.tags.slug,
        name: schema.tags.name,
        kind: schema.tags.kind,
      })
      .from(schema.questionTags)
      .innerJoin(schema.tags, eq(schema.questionTags.tagId, schema.tags.id))
      .where(eq(schema.questionTags.questionId, existingQuestion.id));

    const seedFromDb = buildSeedRepFromDb(
      existingQuestion,
      existingChoices,
      existingTags,
    );

    const dbHash = sha256Hex(canonicalJsonString(seedFromDb));
    if (dbHash === fileHash) {
      skipped += 1;
      continue;
    }

    const desiredLabels = new Set(seedFromFile.choices.map((c) => c.label));
    const deleteCandidates = existingChoices.filter(
      (c) => !desiredLabels.has(c.label),
    );

    const referencedChoiceIds = new Set<string>();
    if (deleteCandidates.length > 0) {
      const deleteCandidateIds = deleteCandidates.map((c) => c.id);

      const referenced = await db
        .select({ selectedChoiceId: schema.attempts.selectedChoiceId })
        .from(schema.attempts)
        .where(
          and(
            eq(schema.attempts.questionId, existingQuestion.id),
            inArray(schema.attempts.selectedChoiceId, deleteCandidateIds),
          ),
        );

      for (const row of referenced) {
        if (row.selectedChoiceId) referencedChoiceIds.add(row.selectedChoiceId);
      }
    }

    const { deleteChoiceIds } = computeChoiceSyncPlan({
      existingChoices: existingChoices.map((c) => ({
        id: c.id,
        label: c.label,
      })),
      desiredChoices: seedFromFile.choices.map((c) => ({ label: c.label })),
      referencedChoiceIds,
    });

    await db.transaction(async (tx) => {
      await tx
        .update(schema.questions)
        .set({
          stemMd: seedFromFile.stem_md,
          explanationMd: seedFromFile.explanation_md,
          difficulty: seedFromFile.difficulty,
          status: seedFromFile.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.questions.id, existingQuestion.id));

      if (deleteChoiceIds.length > 0) {
        await tx
          .delete(schema.choices)
          .where(inArray(schema.choices.id, deleteChoiceIds));
      }

      for (const choice of seedFromFile.choices) {
        await tx
          .insert(schema.choices)
          .values({
            questionId: existingQuestion.id,
            label: choice.label,
            textMd: choice.text_md,
            isCorrect: choice.is_correct,
            sortOrder: choice.sort_order,
          })
          .onConflictDoUpdate({
            target: [schema.choices.questionId, schema.choices.label],
            set: {
              textMd: choice.text_md,
              isCorrect: choice.is_correct,
              sortOrder: choice.sort_order,
            },
          });
      }

      await tx
        .delete(schema.questionTags)
        .where(eq(schema.questionTags.questionId, existingQuestion.id));

      const tagMap = await upsertTags(tx, seedFromFile.tags);
      await tx.insert(schema.questionTags).values(
        seedFromFile.tags.map((t) => ({
          questionId: existingQuestion.id,
          tagId:
            tagMap.get(t.slug)?.id ??
            (() => {
              throw new Error(`Missing tag id for slug "${t.slug}"`);
            })(),
        })),
      );
    });

    updated += 1;
  }

  console.info(
    `Seed complete: inserted=${inserted} updated=${updated} skipped=${skipped} (files=${files.length})`,
  );
  console.info(`Content root: ${path.resolve('content/questions')}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
