import { createHash } from 'node:crypto';
import { z } from 'zod';

// DEBT-483 / ADR-021 decision 4: a release's manifest names its selectable
// set, one entry per question: the slug and the stored-fields-json-v1 hash of
// the revision it selects. The format is app-defined until the content
// repository's SPEC-007 settles, and is not called SPEC-007.
//
// DEBT-489, format v2: a release also names every live question it leaves
// out, and why. Absence from the bundle is never a removal.
//   archived: retired in authored MDX; activation withdraws it for good.
//   draft:    set back to draft in MDX; out of the bank until a release names it.
//   removed:  absent from the bundle, and named by the operator.
// Format v3 also binds the selected revision: equal content can occur in
// multiple immutable revisions, and reusing a release must not substitute one.
// Format v4 freezes the bootstrap's historical candidates separately from
// selectable items. Other v4 releases carry an empty candidate list.
// Format v5 binds ordinary staged releases to their immutable source commit.
export const RELEASE_MANIFEST_FORMAT = 'app-release-manifest-v4';
export const SOURCE_MANIFEST_FORMAT = 'app-release-manifest-v5';
export const CORPUS_COMMIT_PATTERN = /^[0-9a-f]{40}$/;

export const RELEASE_REMOVAL_KINDS = ['archived', 'draft', 'removed'] as const;
export type ReleaseRemovalKind = (typeof RELEASE_REMOVAL_KINDS)[number];

type ContentEntry = { slug: string; contentHash: string };
export type ReleaseManifestEntry = ContentEntry & { revisionId: string };
export type ReleaseManifestRemoval = { slug: string; kind: ReleaseRemovalKind };

export type ReleaseManifest = (
  | {
      format: typeof SOURCE_MANIFEST_FORMAT;
      items: ReleaseManifestEntry[];
      corpusCommit: string;
    }
  | {
      format: typeof RELEASE_MANIFEST_FORMAT;
      items: ReleaseManifestEntry[];
      preBootstrapCandidates: string[];
    }
  | {
      format: 'app-release-manifest-v3';
      items: ReleaseManifestEntry[];
    }
  | {
      format: 'app-release-manifest-v2';
      items: ContentEntry[];
    }
) & {
  removals: ReleaseManifestRemoval[];
};

const CONTENT_HASH = /^[0-9a-f]{64}$/;

// Code-point order, which is Python's sort order for str.
function compareSlugs(a: { slug: string }, b: { slug: string }): number {
  if (a.slug < b.slug) return -1;
  return a.slug > b.slug ? 1 : 0;
}

export function buildReleaseManifest(
  entries: readonly ReleaseManifestEntry[],
  removals: readonly ReleaseManifestRemoval[] = [],
  format: ReleaseManifest['format'] = RELEASE_MANIFEST_FORMAT,
  preBootstrapCandidates: readonly string[] = [],
  corpusCommit?: string,
): ReleaseManifest {
  if (format !== RELEASE_MANIFEST_FORMAT && preBootstrapCandidates.length > 0) {
    throw new Error('Legacy manifests cannot carry bootstrap candidates');
  }
  const candidates = preBootstrapCandidates
    .map((id) => z.guid().parse(id))
    .sort();
  if (new Set(candidates).size !== candidates.length) {
    throw new Error('A bootstrap candidate appears more than once');
  }
  const items = [...entries].sort(compareSlugs);
  for (const item of items) {
    if (!CONTENT_HASH.test(item.contentHash)) {
      throw new Error(
        `${item.slug}: content hash must be lowercase SHA-256 hex`,
      );
    }
  }
  const sortedRemovals = removals
    .map(({ slug, kind }) => ({ slug, kind }))
    .sort(compareSlugs);
  const slugs = [...items, ...sortedRemovals].map(({ slug }) => slug).sort();
  slugs.forEach((slug, index) => {
    if (index > 0 && slugs[index - 1] === slug) {
      throw new Error(`${slug} appears more than once in the manifest`);
    }
  });
  // Legacy formats are used only to verify existing releases in their
  // original form. Their bytes and hashes must not gain the new list.
  if (format === 'app-release-manifest-v2') {
    return {
      format,
      items: items.map(({ slug, contentHash }) => ({ slug, contentHash })),
      removals: sortedRemovals,
    };
  }
  const content = {
    items: items.map(({ slug, contentHash, revisionId }) => ({
      slug,
      contentHash,
      revisionId: z.guid().parse(revisionId),
    })),
    removals: sortedRemovals,
  };
  if (format === SOURCE_MANIFEST_FORMAT) {
    return {
      format,
      ...content,
      corpusCommit: z.string().regex(CORPUS_COMMIT_PATTERN).parse(corpusCommit),
    };
  }
  return format === RELEASE_MANIFEST_FORMAT
    ? { format, ...content, preBootstrapCandidates: candidates }
    : { format, ...content };
}

// Sorted keys at every level and no insignificant whitespace, byte-identical
// to Python's json.dumps(m, sort_keys=True, separators=(",", ":"),
// ensure_ascii=False).
export function canonicalReleaseManifestJson(
  manifest: ReleaseManifest,
): string {
  return JSON.stringify({
    ...(manifest.format === SOURCE_MANIFEST_FORMAT
      ? { corpusCommit: manifest.corpusCommit }
      : {}),
    format: manifest.format,
    items:
      manifest.format === 'app-release-manifest-v2'
        ? manifest.items.map(({ slug, contentHash }) => ({ contentHash, slug }))
        : manifest.items.map(({ slug, contentHash, revisionId }) => ({
            contentHash,
            revisionId,
            slug,
          })),
    ...(manifest.format === RELEASE_MANIFEST_FORMAT
      ? { preBootstrapCandidates: manifest.preBootstrapCandidates }
      : {}),
    removals: manifest.removals.map(({ slug, kind }) => ({ kind, slug })),
  });
}

export function releaseManifestHash(manifest: ReleaseManifest): string {
  return createHash('sha256')
    .update(canonicalReleaseManifestJson(manifest))
    .digest('hex');
}

const contentEntrySchema = z
  .object({
    slug: z.string().min(1),
    contentHash: z.string().regex(CONTENT_HASH),
  })
  .strict();
const removalsSchema = z.array(
  z
    .object({
      slug: z.string().min(1),
      kind: z.enum(RELEASE_REMOVAL_KINDS),
    })
    .strict(),
);
const storedManifestSchema = z.discriminatedUnion('format', [
  z
    .object({
      format: z.literal(SOURCE_MANIFEST_FORMAT),
      items: z.array(contentEntrySchema.extend({ revisionId: z.guid() })),
      corpusCommit: z.string().regex(CORPUS_COMMIT_PATTERN),
      removals: removalsSchema,
    })
    .strict(),
  z
    .object({
      format: z.literal('app-release-manifest-v2'),
      items: z.array(contentEntrySchema),
      removals: removalsSchema,
    })
    .strict(),
  z
    .object({
      format: z.literal('app-release-manifest-v3'),
      items: z.array(contentEntrySchema.extend({ revisionId: z.guid() })),
      removals: removalsSchema,
    })
    .strict(),
  z
    .object({
      format: z.literal(RELEASE_MANIFEST_FORMAT),
      items: z.array(contentEntrySchema.extend({ revisionId: z.guid() })),
      preBootstrapCandidates: z.array(z.guid()),
      removals: removalsSchema,
    })
    .strict(),
]);

// A stored manifest comes back from jsonb with its keys reordered; its entries
// must still be exactly what buildReleaseManifest writes.
export function parseReleaseManifest(value: unknown): ReleaseManifest {
  const parsed = storedManifestSchema.parse(value);
  if (
    parsed.format === RELEASE_MANIFEST_FORMAT &&
    parsed.preBootstrapCandidates.some((id, index) => {
      const previous = parsed.preBootstrapCandidates[index - 1];
      return previous !== undefined && previous >= id;
    })
  ) {
    throw new Error(
      'Stored bootstrap candidates must be unique and in ID order',
    );
  }
  const slugs = [...parsed.items, ...parsed.removals].map(({ slug }) => slug);
  if (new Set(slugs).size !== slugs.length) {
    throw new Error('A question appears more than once in the manifest');
  }
  if (
    [parsed.items, parsed.removals].some((entries) =>
      entries.some((entry, index) => {
        const previous = entries[index - 1];
        return previous !== undefined && compareSlugs(previous, entry) >= 0;
      }),
    )
  ) {
    throw new Error('Stored manifest entries are not in slug order');
  }
  return parsed;
}
