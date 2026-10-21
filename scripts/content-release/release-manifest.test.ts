import { describe, expect, it } from 'vitest';
import {
  buildReleaseManifest,
  canonicalReleaseManifestJson,
  parseReleaseManifest,
  RELEASE_MANIFEST_FORMAT,
  releaseManifestHash,
} from './release-manifest';

const REVISION_A = '00000000-0000-4000-8000-000000000001';
const REVISION_B = '00000000-0000-4000-8000-000000000002';
const HASH_A = 'a'.repeat(64);
const HASH_B = '0123456789abcdef'.repeat(4);

const ITEMS = [
  { slug: 'beta-q', contentHash: HASH_B, revisionId: REVISION_B },
  { slug: 'alpha-q', contentHash: HASH_A, revisionId: REVISION_A },
];
const REMOVALS = [
  { slug: 'gamma-q', kind: 'archived' as const },
  { slug: 'delta-q', kind: 'draft' as const },
];

describe('release manifest', () => {
  it('gives identical content at different revisions different release identities', () => {
    const revisionId = '00000000-0000-4000-8000-000000000001';
    const nextRevisionId = '00000000-0000-4000-8000-000000000002';
    const item = { slug: 'alpha-q', contentHash: HASH_A, revisionId };
    const first = buildReleaseManifest([item]);
    const next = buildReleaseManifest([
      { ...item, revisionId: nextRevisionId },
    ]);

    expect(first.format).toBe('app-release-manifest-v4');
    expect(first.items).toEqual([item]);
    expect(releaseManifestHash(first)).not.toBe(releaseManifestHash(next));
  });

  it('preserves the canonical bytes and hash when reading or rebuilding a v2 manifest', () => {
    const stored = parseReleaseManifest(JSON.parse(V2_CANONICAL));
    const rebuilt = buildReleaseManifest(
      ITEMS,
      REMOVALS,
      'app-release-manifest-v2',
    );

    expect(canonicalReleaseManifestJson(stored)).toBe(V2_CANONICAL);
    expect(releaseManifestHash(stored)).toBe(V2_DIGEST);
    expect(canonicalReleaseManifestJson(rebuilt)).toBe(V2_CANONICAL);
    expect(releaseManifestHash(rebuilt)).toBe(V2_DIGEST);
  });

  // Computed independently with Python's standard library:
  // json.dumps(m, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
  const V2_CANONICAL = `{"format":"app-release-manifest-v2","items":[{"contentHash":"${HASH_A}","slug":"alpha-q"},{"contentHash":"${HASH_B}","slug":"beta-q"}],"removals":[{"kind":"draft","slug":"delta-q"},{"kind":"archived","slug":"gamma-q"}]}`;
  const V2_DIGEST =
    'cdf14ee1a6deb5388f09402de2545b92f32b20e91f06e67e43bf1e9e83a76ba0';

  const V3_CANONICAL = `{"format":"app-release-manifest-v3","items":[{"contentHash":"${HASH_A}","revisionId":"${REVISION_A}","slug":"alpha-q"},{"contentHash":"${HASH_B}","revisionId":"${REVISION_B}","slug":"beta-q"}],"removals":[{"kind":"draft","slug":"delta-q"},{"kind":"archived","slug":"gamma-q"}]}`;
  const V3_DIGEST =
    'a063925e13f88f4b5d30a0d31e1c5ef1e79ec9cf97795f6eaac01767f1d1f188';

  const CANONICAL = `{"format":"app-release-manifest-v4","items":[{"contentHash":"${HASH_A}","revisionId":"${REVISION_A}","slug":"alpha-q"},{"contentHash":"${HASH_B}","revisionId":"${REVISION_B}","slug":"beta-q"}],"preBootstrapCandidates":[],"removals":[{"kind":"draft","slug":"delta-q"},{"kind":"archived","slug":"gamma-q"}]}`;
  const DIGEST =
    '70c201744faec3f82ed7785d5dd1a70163797f783d83af0e6bc6d04001f79eb7';

  it('preserves the canonical bytes and hash of a v3 manifest', () => {
    const stored = parseReleaseManifest(JSON.parse(V3_CANONICAL));
    const rebuilt = buildReleaseManifest(
      ITEMS,
      REMOVALS,
      'app-release-manifest-v3',
    );
    expect(canonicalReleaseManifestJson(stored)).toBe(V3_CANONICAL);
    expect(releaseManifestHash(stored)).toBe(V3_DIGEST);
    expect(canonicalReleaseManifestJson(rebuilt)).toBe(V3_CANONICAL);
    expect(releaseManifestHash(rebuilt)).toBe(V3_DIGEST);
  });

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
      { slug: 'b-q', contentHash: HASH_A, revisionId: REVISION_A },
      { slug: 'B-q', contentHash: HASH_A, revisionId: REVISION_A },
    ]);

    expect(manifest.items.map((item) => item.slug)).toEqual(['B-q', 'b-q']);
  });

  it('refuses a slug named twice', () => {
    expect(() =>
      buildReleaseManifest([
        { slug: 'alpha-q', contentHash: HASH_A, revisionId: REVISION_A },
        { slug: 'alpha-q', contentHash: HASH_B, revisionId: REVISION_B },
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
      buildReleaseManifest([
        {
          slug: 'alpha-q',
          contentHash: 'A'.repeat(64),
          revisionId: REVISION_A,
        },
      ]),
    ).toThrow(/content hash/);
  });

  it('reads back a stored manifest whatever its key order', () => {
    const stored = JSON.parse(
      `{"removals":[{"slug":"gamma-q","kind":"archived"}],"items":[{"slug":"alpha-q","contentHash":"${HASH_A}","revisionId":"${REVISION_A}"}],"preBootstrapCandidates":[],"format":"${RELEASE_MANIFEST_FORMAT}"}`,
    );

    expect(parseReleaseManifest(stored)).toEqual({
      format: RELEASE_MANIFEST_FORMAT,
      preBootstrapCandidates: [],
      items: [{ slug: 'alpha-q', contentHash: HASH_A, revisionId: REVISION_A }],
      removals: [{ slug: 'gamma-q', kind: 'archived' }],
    });
  });

  it.each([
    'app-release-manifest-v2',
    'app-release-manifest-v3',
    RELEASE_MANIFEST_FORMAT,
  ] as const)(
    'refuses a stored %s manifest that both selects and removes a question',
    (format) => {
      const stored = {
        format,
        ...(format === RELEASE_MANIFEST_FORMAT
          ? { preBootstrapCandidates: [] }
          : {}),
        items: [
          {
            slug: 'alpha-q',
            contentHash: HASH_A,
            ...(format !== 'app-release-manifest-v2'
              ? { revisionId: REVISION_A }
              : {}),
          },
        ],
        removals: [{ slug: 'alpha-q', kind: 'removed' }],
      };

      expect(() => parseReleaseManifest(stored)).toThrow(
        'A question appears more than once in the manifest',
      );
    },
  );

  it.each([
    [
      'the first format',
      { format: 'app-release-manifest-v1', items: [], removals: [] },
    ],
    [
      'an extra key',
      {
        format: RELEASE_MANIFEST_FORMAT,
        preBootstrapCandidates: [],
        items: [],
        removals: [],
        note: 1,
      },
    ],
    [
      'an unknown removal kind',
      {
        format: RELEASE_MANIFEST_FORMAT,
        preBootstrapCandidates: [],
        items: [],
        removals: [{ slug: 'alpha-q', kind: 'deleted' }],
      },
    ],
    [
      'entries out of order',
      {
        format: RELEASE_MANIFEST_FORMAT,
        preBootstrapCandidates: [],
        items: [
          { slug: 'beta-q', contentHash: HASH_B, revisionId: REVISION_B },
          { slug: 'alpha-q', contentHash: HASH_A, revisionId: REVISION_A },
        ],
        removals: [],
      },
    ],
    [
      'removals out of order',
      {
        format: RELEASE_MANIFEST_FORMAT,
        preBootstrapCandidates: [],
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

// Source metadata changes release identity without changing legacy canonical bytes.
it('binds the source commit in a v5 manifest and round-trips it', () => {
  const first = buildReleaseManifest(
    ITEMS,
    [],
    'app-release-manifest-v5',
    [],
    'a'.repeat(40),
  );
  const second = buildReleaseManifest(
    ITEMS,
    [],
    'app-release-manifest-v5',
    [],
    'b'.repeat(40),
  );
  expect(first).toMatchObject({
    format: 'app-release-manifest-v5',
    corpusCommit: 'a'.repeat(40),
  });
  expect(releaseManifestHash(first)).not.toBe(releaseManifestHash(second));
  expect(
    parseReleaseManifest(JSON.parse(canonicalReleaseManifestJson(first))),
  ).toEqual(first);
});
