import { describe, expect, it } from 'vitest';
import {
  type CarryEvidence,
  checkFeatureMerge,
  headPushedAsOf,
} from './merge-reviewed-pr';
import {
  HEAD,
  MAIN,
  OLD_HEAD,
  pullRequest,
  pushedAt,
  pushes,
  review,
} from './merge-reviewed-pr-test-helpers';

describe('CodeRabbit approval carried to a later head', () => {
  const manifest = {
    filename: 'package.json',
    status: 'modified',
    patch: '@@ -1 +1 @@\n-"resend": "6.18.0"\n+"resend": "6.28.1"',
  };
  const lockfile = (patch: string) => ({
    filename: 'pnpm-lock.yaml',
    status: 'modified',
    patch,
  });
  const dependabotPr = () => {
    const pr = pullRequest();
    pr.files = {
      nodes: [{ path: 'package.json' }, { path: 'pnpm-lock.yaml' }],
      pageInfo: { hasNextPage: false },
    };
    return pr;
  };
  const evidence = (
    current: CarryEvidence['current'] = [manifest, lockfile('rebased')],
  ): CarryEvidence => ({
    reviewId: 123,
    approvedHead: OLD_HEAD,
    approved: [manifest, lockfile('original')],
    current,
  });

  it('carries the approval when only the lockfile changed since it', () => {
    expect(
      checkFeatureMerge(
        dependabotPr(),
        [[review('APPROVED', OLD_HEAD)]],
        evidence(),
      ),
    ).toMatchObject({
      head: HEAD,
      approvalId: 123,
      carriedFrom: OLD_HEAD,
    });
  });

  it('refuses when a reviewable file changed since the approval', () => {
    const changed = { ...manifest, patch: `${manifest.patch}\n+"extra": "1"` };

    expect(() =>
      checkFeatureMerge(
        dependabotPr(),
        [[review('APPROVED', OLD_HEAD)]],
        evidence([changed, lockfile('rebased')]),
      ),
    ).toThrow('exact-head CodeRabbit approval');
  });

  it('refuses when a reviewable file was added since the approval', () => {
    expect(() =>
      checkFeatureMerge(
        dependabotPr(),
        [[review('APPROVED', OLD_HEAD)]],
        evidence([
          manifest,
          lockfile('rebased'),
          { filename: 'src/new.ts', status: 'added', patch: '+x' },
        ]),
      ),
    ).toThrow('exact-head CodeRabbit approval');
  });

  it('refuses when a renamed file now comes from another path', () => {
    const renamed = (previous: string) => ({
      filename: 'src/config.ts',
      previous_filename: previous,
      status: 'renamed',
      patch: '@@ -1 +1 @@\n-a\n+b',
    });

    expect(() =>
      checkFeatureMerge(dependabotPr(), [[review('APPROVED', OLD_HEAD)]], {
        reviewId: 123,
        approvedHead: OLD_HEAD,
        approved: [manifest, renamed('src/a.ts'), lockfile('original')],
        current: [manifest, renamed('src/b.ts'), lockfile('rebased')],
      }),
    ).toThrow('exact-head CodeRabbit approval');
  });

  it('refuses when a file was renamed onto the lockfile path', () => {
    expect(() =>
      checkFeatureMerge(
        dependabotPr(),
        [[review('APPROVED', OLD_HEAD)]],
        evidence([
          manifest,
          {
            filename: 'pnpm-lock.yaml',
            previous_filename: 'src/secret.ts',
            status: 'renamed',
            patch: 'rebased',
          },
        ]),
      ),
    ).toThrow('exact-head CodeRabbit approval');
  });

  it('refuses when a reviewable diff is unavailable', () => {
    const { patch: _omitted, ...withoutPatch } = manifest;

    expect(() =>
      checkFeatureMerge(dependabotPr(), [[review('APPROVED', OLD_HEAD)]], {
        reviewId: 123,
        approvedHead: OLD_HEAD,
        approved: [withoutPatch, lockfile('original')],
        current: [withoutPatch, lockfile('rebased')],
      }),
    ).toThrow('exact-head CodeRabbit approval');
  });

  it('carries an approval left on an earlier head of any PR when the reviewable diff is unchanged', () => {
    expect(
      checkFeatureMerge(
        pullRequest(),
        [[review('APPROVED', OLD_HEAD)]],
        evidence(),
      ),
    ).toMatchObject({ head: HEAD, carriedFrom: OLD_HEAD });
  });

  // A push that only merges dev leaves the PR's diff unchanged, and GitHub
  // repoints the approval to the new head (changelog 2023-06-06).
  it('carries an approval GitHub repointed onto a head pushed after it', () => {
    expect(
      checkFeatureMerge(
        pullRequest(pushedAt('2026-09-22T04:00:00Z')),
        [[review()]],
        evidence(),
      ),
    ).toMatchObject({ head: HEAD, approvalId: 123, carriedFrom: OLD_HEAD });
  });

  // git patch-id's notion of the same change: dev's edits elsewhere in a file
  // move the PR's hunks without changing them.
  it('carries an approval when dev only moved the PR’s hunks within a file', () => {
    const hunk = (header: string) => ({
      filename: 'AGENTS.md',
      status: 'modified',
      patch: `${header}\n context\n-old\n+new\n context`,
    });

    expect(
      checkFeatureMerge(
        pullRequest(pushedAt('2026-09-22T04:00:00Z')),
        [[review()]],
        {
          reviewId: 123,
          approvedHead: OLD_HEAD,
          approved: [hunk('@@ -10,3 +10,3 @@ ## The Rule')],
          current: [hunk('@@ -14,3 +14,3 @@ ## The Rule (amended)')],
        },
      ),
    ).toMatchObject({ carriedFrom: OLD_HEAD });
  });

  it('refuses when dev changed the context around a PR hunk', () => {
    const hunk = (context: string) => ({
      filename: 'AGENTS.md',
      status: 'modified',
      patch: `@@ -10,3 +10,3 @@\n ${context}\n-old\n+new`,
    });

    expect(() =>
      checkFeatureMerge(
        pullRequest(pushedAt('2026-09-22T04:00:00Z')),
        [[review()]],
        {
          reviewId: 123,
          approvedHead: OLD_HEAD,
          approved: [hunk('never merge')],
          current: [hunk('always merge')],
        },
      ),
    ).toThrow('predates the push of the head');
  });

  it('refuses a repointed approval when the reviewable diff changed', () => {
    const changed = { ...manifest, patch: `${manifest.patch}\n+"extra": "1"` };

    expect(() =>
      checkFeatureMerge(
        pullRequest(pushedAt('2026-09-22T04:00:00Z')),
        [[review()]],
        evidence([changed, lockfile('rebased')]),
      ),
    ).toThrow('predates the push of the head');
  });

  it('refuses evidence read for another review', () => {
    expect(() =>
      checkFeatureMerge(dependabotPr(), [[review('APPROVED', OLD_HEAD)]], {
        ...evidence(),
        reviewId: 999,
      }),
    ).toThrow('exact-head CodeRabbit approval');
  });

  it('refuses evidence that names the current head as the approved one', () => {
    expect(() =>
      checkFeatureMerge(
        pullRequest(pushedAt('2026-09-22T04:00:00Z')),
        [[review()]],
        { ...evidence(), approvedHead: HEAD },
      ),
    ).toThrow('predates the push of the head');
  });

  it('refuses when CodeRabbit last requested changes', () => {
    expect(() =>
      checkFeatureMerge(
        dependabotPr(),
        [
          [
            review('APPROVED', OLD_HEAD),
            { ...review('CHANGES_REQUESTED', OLD_HEAD), id: 124 },
          ],
        ],
        evidence(),
      ),
    ).toThrow('exact-head CodeRabbit approval');
  });

  it('refuses evidence for another approved head', () => {
    expect(() =>
      checkFeatureMerge(dependabotPr(), [[review('APPROVED', OLD_HEAD)]], {
        ...evidence(),
        approvedHead: 'c'.repeat(40),
      }),
    ).toThrow('exact-head CodeRabbit approval');
  });
});

describe('head as of an approval', () => {
  it('names the head pushed most recently at or before the approval', () => {
    expect(
      headPushedAsOf(
        pushes(
          [OLD_HEAD, '2026-09-22T02:00:00Z'],
          [MAIN, '2026-09-22T03:00:00Z'],
          [HEAD, '2026-09-22T04:00:00Z'],
        ),
        '2026-09-22T03:00:00Z',
      ),
    ).toBe(MAIN);
  });

  it('dates each head by its earliest check suite and skips heads without one', () => {
    expect(
      headPushedAsOf(
        pushes(
          [OLD_HEAD, '2026-09-22T02:00:00Z'],
          [MAIN],
          [HEAD, '2026-09-22T05:00:00Z', '2026-09-22T02:30:00Z'],
        ),
        '2026-09-22T03:00:00Z',
      ),
    ).toBe(HEAD);
  });

  it('finds no head when every push follows the approval', () => {
    expect(
      headPushedAsOf(
        pushes([HEAD, '2026-09-22T04:00:00Z']),
        '2026-09-22T03:00:00Z',
      ),
    ).toBeUndefined();
  });

  it('finds no head when the commit list or a suite list is truncated', () => {
    const olderCommits = pushes([HEAD, '2026-09-22T02:00:00Z']);
    olderCommits.pushes.pageInfo.hasPreviousPage = true;
    const moreSuites = pushes([HEAD, '2026-09-22T02:00:00Z']);
    const suites = moreSuites.pushes.nodes[0]?.commit.checkSuites;
    if (!suites) throw new Error('Missing fixture');
    suites.pageInfo.hasNextPage = true;

    expect(
      headPushedAsOf(olderCommits, '2026-09-22T03:00:00Z'),
    ).toBeUndefined();
    expect(headPushedAsOf(moreSuites, '2026-09-22T03:00:00Z')).toBeUndefined();
  });
});
