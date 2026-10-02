import { describe, expect, it } from 'vitest';
import {
  buildReleaseManifest,
  canonicalReleaseManifestJson,
  parseReleaseManifest,
  RELEASE_MANIFEST_FORMAT,
  releaseManifestHash,
} from './release-manifest';

const HASH_A = 'a'.repeat(64);
const HASH_B = '0123456789abcdef'.repeat(4);

const ITEMS = [
  { slug: 'beta-q', contentHash: HASH_B },
  { slug: 'alpha-q', contentHash: HASH_A },
];
const REMOVALS = [
  { slug: 'gamma-q', kind: 'archived' as const },
  { slug: 'delta-q', kind: 'draft' as const },
];

describe('release manifest', () => {
  // Computed independently with Python's standard library:
  // json.dumps(m, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
  const CANONICAL = `{"format":"app-release-manifest-v2","items":[{"contentHash":"${HASH_A}","slug":"alpha-q"},{"contentHash":"${HASH_B}","slug":"beta-q"}],"removals":[{"kind":"draft","slug":"delta-q"},{"kind":"archived","slug":"gamma-q"}]}`;
  const DIGEST =
    'cdf14ee1a6deb5388f09402de2545b92f32b20e91f06e67e43bf1e9e83a76ba0';

  it('orders items and removals by slug and writes the canonical form', () => {
    expect(
      canonicalReleaseManifestJson(buildReleaseManifest(ITEMS, REMOVALS)),
    ).toBe(CANONICAL);
  });

  it('hashes the canonical form with SHA-256, removals included', () => {
    const manifest = buildReleaseManifest(ITEMS, REMOVALS);

    expect(releaseManifestHash(manifest)).toBe(DIGEST);
    expect(releaseManifestHash(buildReleaseManifest(ITEMS))).not.toBe(DIGEST);
  });

  it('orders slugs by code point, as Python does', () => {
    const manifest = buildReleaseManifest([
      { slug: 'b-q', contentHash: HASH_A },
      { slug: 'B-q', contentHash: HASH_A },
    ]);

    expect(manifest.items.map((item) => item.slug)).toEqual(['B-q', 'b-q']);
  });

  it('refuses a slug named twice', () => {
    expect(() =>
      buildReleaseManifest([
        { slug: 'alpha-q', contentHash: HASH_A },
        { slug: 'alpha-q', contentHash: HASH_B },
      ]),
    ).toThrow(/alpha-q appears more than once/);
  });

  it('refuses a question that is both an item and a removal', () => {
    expect(() =>
      buildReleaseManifest(ITEMS, [{ slug: 'alpha-q', kind: 'draft' }]),
    ).toThrow(/alpha-q appears more than once/);
  });

  it('refuses a content hash that is not lowercase SHA-256 hex', () => {
    expect(() =>
      buildReleaseManifest([{ slug: 'alpha-q', contentHash: 'A'.repeat(64) }]),
    ).toThrow(/content hash/);
  });

  it('reads back a stored manifest whatever its key order', () => {
    const stored = JSON.parse(
      `{"removals":[{"slug":"gamma-q","kind":"archived"}],"items":[{"slug":"alpha-q","contentHash":"${HASH_A}"}],"format":"${RELEASE_MANIFEST_FORMAT}"}`,
    );

    expect(parseReleaseManifest(stored)).toEqual({
      format: RELEASE_MANIFEST_FORMAT,
      items: [{ slug: 'alpha-q', contentHash: HASH_A }],
      removals: [{ slug: 'gamma-q', kind: 'archived' }],
    });
  });

  it.each([
    [
      'the first format',
      { format: 'app-release-manifest-v1', items: [], removals: [] },
    ],
    [
      'an extra key',
      { format: RELEASE_MANIFEST_FORMAT, items: [], removals: [], note: 1 },
    ],
    [
      'an unknown removal kind',
      {
        format: RELEASE_MANIFEST_FORMAT,
        items: [],
        removals: [{ slug: 'alpha-q', kind: 'deleted' }],
      },
    ],
    [
      'entries out of order',
      {
        format: RELEASE_MANIFEST_FORMAT,
        items: [
          { slug: 'beta-q', contentHash: HASH_B },
          { slug: 'alpha-q', contentHash: HASH_A },
        ],
        removals: [],
      },
    ],
    [
      'removals out of order',
      {
        format: RELEASE_MANIFEST_FORMAT,
        items: [],
        removals: [
          { slug: 'gamma-q', kind: 'archived' },
          { slug: 'delta-q', kind: 'draft' },
        ],
      },
    ],
  ])('refuses a stored manifest with %s', (_name, stored) => {
    expect(() => parseReleaseManifest(stored)).toThrow();
  });
});
