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

describe('release manifest', () => {
  // Computed independently with Python's standard library:
  // json.dumps(m, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
  const CANONICAL = `{"format":"app-release-manifest-v1","items":[{"contentHash":"${HASH_A}","slug":"alpha-q"},{"contentHash":"${HASH_B}","slug":"beta-q"}]}`;
  const DIGEST =
    'cb253d7e06537d59c6f200de3db0c9b91c6962e80fac8c7f1d71deb0e88ab2a0';

  it('orders entries by slug and writes the canonical form', () => {
    const manifest = buildReleaseManifest([
      { slug: 'beta-q', contentHash: HASH_B },
      { slug: 'alpha-q', contentHash: HASH_A },
    ]);

    expect(canonicalReleaseManifestJson(manifest)).toBe(CANONICAL);
  });

  it('hashes the canonical form with SHA-256', () => {
    const manifest = buildReleaseManifest([
      { slug: 'alpha-q', contentHash: HASH_A },
      { slug: 'beta-q', contentHash: HASH_B },
    ]);

    expect(releaseManifestHash(manifest)).toBe(DIGEST);
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

  it('refuses a content hash that is not lowercase SHA-256 hex', () => {
    expect(() =>
      buildReleaseManifest([{ slug: 'alpha-q', contentHash: 'A'.repeat(64) }]),
    ).toThrow(/content hash/);
  });

  it('reads back a stored manifest whatever its key order', () => {
    const stored = JSON.parse(
      `{"items":[{"slug":"alpha-q","contentHash":"${HASH_A}"}],"format":"${RELEASE_MANIFEST_FORMAT}"}`,
    );

    expect(parseReleaseManifest(stored)).toEqual({
      format: RELEASE_MANIFEST_FORMAT,
      items: [{ slug: 'alpha-q', contentHash: HASH_A }],
    });
  });

  it.each([
    ['another format', { format: 'other-v1', items: [] }],
    ['an extra key', { format: RELEASE_MANIFEST_FORMAT, items: [], note: 1 }],
    [
      'entries out of order',
      {
        format: RELEASE_MANIFEST_FORMAT,
        items: [
          { slug: 'beta-q', contentHash: HASH_B },
          { slug: 'alpha-q', contentHash: HASH_A },
        ],
      },
    ],
  ])('refuses a stored manifest with %s', (_name, stored) => {
    expect(() => parseReleaseManifest(stored)).toThrow();
  });
});
