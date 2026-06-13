import { inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import {
  CANONICAL_SUBSTANCE_SLUGS,
  CANONICAL_TOPIC_SLUGS,
  CANONICAL_TREATMENT_SLUGS,
} from '../../lib/content/draft-taxonomy';
import type { SeedTag } from './question-parser';

const CANONICAL_TOPIC_SLUG_SET = new Set<string>(CANONICAL_TOPIC_SLUGS);
const CANONICAL_SUBSTANCE_SLUG_SET = new Set<string>(CANONICAL_SUBSTANCE_SLUGS);
const CANONICAL_TREATMENT_SLUG_SET = new Set<string>(CANONICAL_TREATMENT_SLUGS);

export function validateSeedQuestionTags(input: {
  slug: string;
  tags: Array<Omit<SeedTag, 'kind'> & { kind: SeedTag['kind'] | 'domain' }>;
}): void {
  for (const tag of input.tags) {
    if (tag.kind === 'domain') {
      throw new Error(
        `Question "${input.slug}" has domain tag "${tag.slug}" which is not allowed`,
      );
    }
  }

  const topicCount = input.tags.filter((tag) => tag.kind === 'topic').length;
  const substanceCount = input.tags.filter(
    (tag) => tag.kind === 'substance',
  ).length;

  if (topicCount < 1) {
    throw new Error(
      `Question "${input.slug}" must have at least one topic tag`,
    );
  }

  if (substanceCount < 1) {
    throw new Error(
      `Question "${input.slug}" must have at least one substance tag`,
    );
  }

  for (const tag of input.tags) {
    if (tag.kind === 'topic' && !CANONICAL_TOPIC_SLUG_SET.has(tag.slug)) {
      throw new Error(
        `Question "${input.slug}" has non-canonical topic slug "${tag.slug}"`,
      );
    }

    if (
      tag.kind === 'substance' &&
      !CANONICAL_SUBSTANCE_SLUG_SET.has(tag.slug)
    ) {
      throw new Error(
        `Question "${input.slug}" has non-canonical substance slug "${tag.slug}"`,
      );
    }

    if (
      tag.kind === 'treatment' &&
      !CANONICAL_TREATMENT_SLUG_SET.has(tag.slug)
    ) {
      throw new Error(
        `Question "${input.slug}" has non-canonical treatment slug "${tag.slug}"`,
      );
    }
  }
}

export async function upsertTags(
  tx: PostgresJsDatabase<typeof schema>,
  incomingTags: SeedTag[],
): Promise<Map<string, { id: string } & SeedTag>> {
  const tagSlugs = incomingTags.map((tag) => tag.slug);

  const existing = tagSlugs.length
    ? await tx
        .select()
        .from(schema.tags)
        .where(inArray(schema.tags.slug, tagSlugs))
    : [];

  const bySlug = new Map(existing.map((tag) => [tag.slug, tag]));

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
