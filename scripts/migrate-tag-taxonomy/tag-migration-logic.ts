import {
  addOrValidateTag,
  CANONICAL_SUBSTANCE_SLUGS,
  CANONICAL_TOPIC_SLUGS,
  CANONICAL_TREATMENT_SLUGS,
  canonicalSubstanceName,
  canonicalTopicName,
  canonicalTreatmentName,
  inferDomainTopicSlug,
  inferTreatmentSlugs,
  mapLegacyTopicSlug,
} from './tag-taxonomy-mappers';
import type { MigrationInput, MigrationTag } from './types';

export function validateInvariants(tags: readonly MigrationTag[]): void {
  if (tags.some((tag) => tag.kind === 'domain')) {
    throw new Error('Invariant failed: domain tags remain after migration');
  }

  const topicCount = tags.filter((tag) => tag.kind === 'topic').length;
  const substanceCount = tags.filter((tag) => tag.kind === 'substance').length;
  if (topicCount === 0) {
    throw new Error(
      'Invariant failed: migrated question must have at least one topic tag',
    );
  }
  if (substanceCount === 0) {
    throw new Error(
      'Invariant failed: migrated question must have at least one substance tag',
    );
  }

  for (const tag of tags) {
    if (tag.kind === 'topic') {
      if (tag.slug === 'topic' || tag.slug === 'psychosocial') {
        throw new Error(
          `Invariant failed: rogue topic slug "${tag.slug}" found`,
        );
      }
      if (!CANONICAL_TOPIC_SLUGS.has(tag.slug)) {
        throw new Error(
          `Invariant failed: unknown canonical topic slug "${tag.slug}"`,
        );
      }
    }
    if (tag.kind === 'substance' && !CANONICAL_SUBSTANCE_SLUGS.has(tag.slug)) {
      throw new Error(
        `Invariant failed: unknown canonical substance slug "${tag.slug}"`,
      );
    }
    if (tag.kind === 'treatment' && !CANONICAL_TREATMENT_SLUGS.has(tag.slug)) {
      throw new Error(
        `Invariant failed: unknown canonical treatment slug "${tag.slug}"`,
      );
    }
  }
}

export function migrateQuestionTags(input: MigrationInput): MigrationTag[] {
  const bySlug = new Map<string, MigrationTag>();
  const inputTopicSlugs = new Set(
    input.tags.filter((tag) => tag.kind === 'topic').map((tag) => tag.slug),
  );

  for (const tag of input.tags) {
    if (tag.kind === 'domain') {
      const mappedTopicSlug = inferDomainTopicSlug(tag.slug, inputTopicSlugs);
      addOrValidateTag(bySlug, {
        slug: mappedTopicSlug,
        name: canonicalTopicName(mappedTopicSlug),
        kind: 'topic',
      });
      continue;
    }

    if (tag.kind === 'topic') {
      const mappedTopicSlug = mapLegacyTopicSlug(tag.slug, input.filePath);
      addOrValidateTag(bySlug, {
        slug: mappedTopicSlug,
        name: canonicalTopicName(mappedTopicSlug),
        kind: 'topic',
      });
      continue;
    }

    if (tag.kind === 'substance') {
      addOrValidateTag(bySlug, {
        slug: tag.slug,
        name: canonicalSubstanceName(tag.slug),
        kind: 'substance',
      });
      continue;
    }

    if (tag.kind === 'treatment') {
      addOrValidateTag(bySlug, {
        slug: tag.slug,
        name: canonicalTreatmentName(tag.slug),
        kind: 'treatment',
      });
      continue;
    }

    if (tag.kind === 'diagnosis') {
      addOrValidateTag(bySlug, tag);
      continue;
    }

    throw new Error(`Unknown tag kind "${tag.kind}"`);
  }

  for (const slug of inferTreatmentSlugs(input)) {
    addOrValidateTag(bySlug, {
      slug,
      name: canonicalTreatmentName(slug),
      kind: 'treatment',
    });
  }

  const migrated = [...bySlug.values()];
  validateInvariants(migrated);
  return migrated;
}
