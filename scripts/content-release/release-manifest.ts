import { createHash } from 'node:crypto';
import { z } from 'zod';

// DEBT-483 / ADR-021 decision 4: a release's manifest names its selectable
// set, one entry per question: the slug and the stored-fields-json-v1 hash of
// the revision it selects. The format is app-defined until the content
// repository's SPEC-007 settles, and is not called SPEC-007.
export const RELEASE_MANIFEST_FORMAT = 'app-release-manifest-v1';

export type ReleaseManifestEntry = { slug: string; contentHash: string };

export type ReleaseManifest = {
  format: typeof RELEASE_MANIFEST_FORMAT;
  items: ReleaseManifestEntry[];
};

const CONTENT_HASH = /^[0-9a-f]{64}$/;

// Code-point order, which is Python's sort order for str.
function compareSlugs(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export function buildReleaseManifest(
  entries: readonly ReleaseManifestEntry[],
): ReleaseManifest {
  const items = entries
    .map(({ slug, contentHash }) => ({ slug, contentHash }))
    .sort((a, b) => compareSlugs(a.slug, b.slug));
  items.forEach((item, index) => {
    if (!CONTENT_HASH.test(item.contentHash)) {
      throw new Error(
        `${item.slug}: content hash must be lowercase SHA-256 hex`,
      );
    }
    if (index > 0 && items[index - 1]?.slug === item.slug) {
      throw new Error(`${item.slug} appears more than once in the manifest`);
    }
  });
  return { format: RELEASE_MANIFEST_FORMAT, items };
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
  })
  .strict();

// A stored manifest comes back from jsonb with its keys reordered; its entries
// must still be exactly what buildReleaseManifest writes.
export function parseReleaseManifest(value: unknown): ReleaseManifest {
  const parsed = storedManifestSchema.parse(value);
  const rebuilt = buildReleaseManifest(parsed.items);
  rebuilt.items.forEach((item, index) => {
    if (parsed.items[index]?.slug !== item.slug) {
      throw new Error('Stored manifest entries are not in slug order');
    }
  });
  return rebuilt;
}
