import { describe, expect, it } from 'vitest';
import { parseActivateArgs } from './activate-release';
import { parseApplyFlag } from './command-support';

const RELEASE = '3f6c2a1e-8b4d-4c7a-9e2f-1a2b3c4d5e6f';
const ACTIVE = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

describe('parseApplyFlag', () => {
  it('defaults to a dry run', () => {
    expect(parseApplyFlag([])).toEqual({ apply: false });
  });

  it('applies with --apply', () => {
    expect(parseApplyFlag(['--apply'])).toEqual({ apply: true });
  });

  it.each([[['--apply', '--apply']], [['--release']]])('rejects %j', (argv) => {
    expect(() => parseApplyFlag(argv)).toThrow(/Unknown argument/);
  });
});

describe('parseActivateArgs', () => {
  it('reads the release, the expected active release and --apply', () => {
    expect(
      parseActivateArgs([
        '--release',
        RELEASE,
        '--expect-active',
        ACTIVE,
        '--apply',
      ]),
    ).toEqual({
      releaseId: RELEASE,
      expectedActiveReleaseId: ACTIVE,
      apply: true,
    });
  });

  it('reads --expect-active none as no active release', () => {
    expect(
      parseActivateArgs(['--release', RELEASE, '--expect-active', 'none']),
    ).toEqual({
      releaseId: RELEASE,
      expectedActiveReleaseId: null,
      apply: false,
    });
  });

  it.each([
    [[], '--release is required'],
    [['--release', RELEASE], '--expect-active is required'],
    [['--release'], '--release needs a release id'],
    [['--release', 'not-a-uuid'], '--release needs a release id'],
    [
      ['--release', RELEASE, '--expect-active'],
      '--expect-active needs a release id, or none',
    ],
    [
      ['--release', RELEASE, '--expect-active', 'latest'],
      '--expect-active needs a release id, or none',
    ],
    [
      ['--release', RELEASE, '--release', RELEASE],
      'Unknown argument: --release',
    ],
    [['--release', RELEASE, '--all'], 'Unknown argument: --all'],
  ] as const)('rejects %j', (argv, message) => {
    expect(() => parseActivateArgs(argv)).toThrow(message);
  });
});
