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
export const RELEASE_MANIFEST_FORMAT = 'app-release-manifest-v2';

export const RELEASE_REMOVAL_KINDS = ['archived', 'draft', 'removed'] as const;
export type ReleaseRemovalKind = (typeof RELEASE_REMOVAL_KINDS)[number];

export type ReleaseManifestEntry = { slug: string; contentHash: string };
export type ReleaseManifestRemoval = { slug: string; kind: ReleaseRemovalKind };

export type ReleaseManifest = {
  format: typeof RELEASE_MANIFEST_FORMAT;
  items: ReleaseManifestEntry[];
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
): ReleaseManifest {
  const items = entries
    .map(({ slug, contentHash }) => ({ slug, contentHash }))
    .sort(compareSlugs);
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
  return { format: RELEASE_MANIFEST_FORMAT, items, removals: sortedRemovals };
}

// Sorted keys at every level and no insignificant whitespace, byte-identical
// to Python's json.dumps(m, sort_keys=True, separators=(",", ":"),
// ensure_ascii=False).
export function canonicalReleaseManifestJson(
  manifest: ReleaseManifest,
): string {
  return JSON.stringify({
    format: manifest.format,
    items: manifest.items.map(({ slug, contentHash }) => ({
      contentHash,
      slug,
    })),
    removals: manifest.removals.map(({ slug, kind }) => ({ kind, slug })),
  });
}

export function releaseManifestHash(manifest: ReleaseManifest): string {
  return createHash('sha256')
    .update(canonicalReleaseManifestJson(manifest))
    .digest('hex');
}

const storedManifestSchema = z
  .object({
    format: z.literal(RELEASE_MANIFEST_FORMAT),
    items: z.array(
      z.object({ slug: z.string().min(1), contentHash: z.string() }).strict(),
    ),
    removals: z.array(
      z
        .object({
          slug: z.string().min(1),
          kind: z.enum(RELEASE_REMOVAL_KINDS),
        })
        .strict(),
    ),
  })
  .strict();

// A stored manifest comes back from jsonb with its keys reordered; its entries
// must still be exactly what buildReleaseManifest writes.
export function parseReleaseManifest(value: unknown): ReleaseManifest {
  const parsed = storedManifestSchema.parse(value);
  const rebuilt = buildReleaseManifest(parsed.items, parsed.removals);
  const inOrder =
    rebuilt.items.every(
      (item, index) => parsed.items[index]?.slug === item.slug,
    ) &&
    rebuilt.removals.every(
      (removal, index) => parsed.removals[index]?.slug === removal.slug,
    );
  if (!inOrder) {
    throw new Error('Stored manifest entries are not in slug order');
  }
  return rebuilt;
}
