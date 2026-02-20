import { CANONICAL_KINDS, type MigrationTag } from './types';

const VALID_INPUT_KINDS = new Set<string>([...CANONICAL_KINDS, 'domain']);

export function parseTags(rawTags: unknown, filePath: string): MigrationTag[] {
  if (!Array.isArray(rawTags)) {
    throw new Error(
      `Invalid tags frontmatter in ${filePath}: expected an array`,
    );
  }

  return rawTags.map((rawTag, index) => {
    if (!rawTag || typeof rawTag !== 'object') {
      throw new Error(
        `Invalid tag at index ${index} in ${filePath}: expected object`,
      );
    }

    const record = rawTag as Record<string, unknown>;
    if (typeof record.slug !== 'string' || record.slug.length === 0) {
      throw new Error(
        `Invalid tag slug at index ${index} in ${filePath}: expected non-empty string`,
      );
    }
    if (typeof record.name !== 'string' || record.name.length === 0) {
      throw new Error(
        `Invalid tag name at index ${index} in ${filePath}: expected non-empty string`,
      );
    }
    if (typeof record.kind !== 'string' || record.kind.length === 0) {
      throw new Error(
        `Invalid tag kind at index ${index} in ${filePath}: expected non-empty string`,
      );
    }

    if (!VALID_INPUT_KINDS.has(record.kind)) {
      throw new Error(
        `Invalid tag kind "${record.kind}" at index ${index} in ${filePath}: expected one of ${[...VALID_INPUT_KINDS].join(', ')}`,
      );
    }

    return {
      slug: record.slug,
      name: record.name,
      kind: record.kind as MigrationTag['kind'],
    };
  });
}

export function parseChoiceTexts(rawChoices: unknown): Array<{ text: string }> {
  if (!Array.isArray(rawChoices)) {
    return [];
  }

  return rawChoices.flatMap((rawChoice) => {
    if (!rawChoice || typeof rawChoice !== 'object') {
      return [];
    }

    const record = rawChoice as Record<string, unknown>;
    if (typeof record.text !== 'string' || record.text.length === 0) {
      return [];
    }

    return [{ text: record.text }];
  });
}

export function tagsSignature(tags: readonly MigrationTag[]): string {
  // Intentionally order-sensitive so frontmatter tag-order changes are treated
  // as content changes by runMigration.
  return JSON.stringify(
    tags.map((tag) => ({
      slug: tag.slug,
      name: tag.name,
      kind: tag.kind,
    })),
  );
}
