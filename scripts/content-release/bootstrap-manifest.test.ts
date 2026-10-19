import { describe, expect, it } from 'vitest';
import {
  buildReleaseManifest,
  canonicalReleaseManifestJson,
  parseReleaseManifest,
  releaseManifestHash,
} from './release-manifest';

const EARLIER = '00000000-0000-4000-8000-000000000001';
const LATER = '00000000-0000-4000-8000-000000000002';
const FORMAT = 'app-release-manifest-v4';
const stored = {
  format: FORMAT,
  items: [],
  preBootstrapCandidates: [EARLIER, LATER],
  removals: [],
};

describe('bootstrap manifest candidates', () => {
  it('writes sorted candidate IDs separately from release items and binds them to the hash', () => {
    const manifest = buildReleaseManifest([], [], FORMAT, [LATER, EARLIER]);
    expect(manifest).toEqual(stored);
    expect(canonicalReleaseManifestJson(manifest)).toBe(
      `{"format":"app-release-manifest-v4","items":[],"preBootstrapCandidates":["${EARLIER}","${LATER}"],"removals":[]}`,
    );
    expect(releaseManifestHash(manifest)).not.toBe(
      releaseManifestHash(buildReleaseManifest([], [], FORMAT, [EARLIER])),
    );
  });

  it('round-trips the frozen list from JSONB without making it a release item', () => {
    expect(parseReleaseManifest(stored)).toEqual(stored);
  });

  it('keeps legacy v3 canonical bytes and hashes unchanged', () => {
    const legacy = {
      format: 'app-release-manifest-v3',
      items: [],
      removals: [],
    };
    const parsed = parseReleaseManifest(legacy);
    const rebuilt = buildReleaseManifest([], [], 'app-release-manifest-v3');
    expect(canonicalReleaseManifestJson(parsed)).toBe(
      '{"format":"app-release-manifest-v3","items":[],"removals":[]}',
    );
    expect(rebuilt).toEqual(parsed);
    expect(releaseManifestHash(rebuilt)).toBe(releaseManifestHash(parsed));
  });

  it.each([
    ['not UUIDs', ['not-a-revision']],
    ['duplicates', [EARLIER, EARLIER]],
    ['not sorted', [LATER, EARLIER]],
  ])('refuses stored candidate IDs that are %s', (_reason, candidates) => {
    expect(() =>
      parseReleaseManifest({ ...stored, preBootstrapCandidates: candidates }),
    ).toThrow();
  });

  it('refuses duplicate candidates when building a manifest', () => {
    expect(() =>
      buildReleaseManifest([], [], FORMAT, [EARLIER, EARLIER]),
    ).toThrow(/candidate.*more than once/i);
  });

  it.each(['app-release-manifest-v2', 'app-release-manifest-v3'] as const)(
    'refuses to discard candidates when rebuilding %s',
    (format) => {
      expect(() => buildReleaseManifest([], [], format, [EARLIER])).toThrow(
        /cannot carry.*candidates/i,
      );
    },
  );
});
