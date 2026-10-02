import { describe, expect, it } from 'vitest';
import { parseActivateArgs } from './activate-release';
import { parseBootstrapArgs } from './bootstrap-release';
import { parseStageArgs } from './stage-release';

const RELEASE = '3f6c2a1e-8b4d-4c7a-9e2f-1a2b3c4d5e6f';
const ACTIVE = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const PLAN = 'c'.repeat(64);

describe('parseBootstrapArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseBootstrapArgs([])).toEqual({
      apply: false,
      expectedPlanId: undefined,
    });
  });

  it('applies the plan a preview printed', () => {
    expect(parseBootstrapArgs(['--plan', PLAN, '--apply'])).toEqual({
      apply: true,
      expectedPlanId: PLAN,
    });
  });

  it.each([
    [['--apply'], '--plan is required with --apply'],
    [['--plan'], '--plan needs the plan id a preview printed'],
    [['--plan', PLAN, '--plan', PLAN], 'Unknown argument: --plan'],
    [['--apply', '--apply'], 'Unknown argument: --apply'],
    [['--release'], 'Unknown argument: --release'],
  ] as const)('rejects %j', (argv, message) => {
    expect(() => parseBootstrapArgs(argv)).toThrow(message);
  });
});

describe('parseActivateArgs', () => {
  it('reads the release, the expected active release, the plan and --apply', () => {
    expect(
      parseActivateArgs([
        '--release',
        RELEASE,
        '--expect-active',
        ACTIVE,
        '--plan',
        PLAN,
        '--apply',
      ]),
    ).toEqual({
      releaseId: RELEASE,
      expectedActiveReleaseId: ACTIVE,
      expectedPlanId: PLAN,
      apply: true,
    });
  });

  it('reads --expect-active none as no active release', () => {
    expect(
      parseActivateArgs(['--release', RELEASE, '--expect-active', 'none']),
    ).toEqual({
      releaseId: RELEASE,
      expectedActiveReleaseId: null,
      expectedPlanId: undefined,
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
    // DEBT-489: an apply is held to the plan its preview printed.
    [
      ['--release', RELEASE, '--expect-active', 'none', '--apply'],
      '--plan is required with --apply',
    ],
    [
      ['--release', RELEASE, '--expect-active', 'none', '--plan', 'abc'],
      '--plan needs the plan id a preview printed',
    ],
    [
      ['--release', RELEASE, '--plan', PLAN, '--plan', PLAN],
      'Unknown argument: --plan',
    ],
  ] as const)('rejects %j', (argv, message) => {
    expect(() => parseActivateArgs(argv)).toThrow(message);
  });
});

describe('parseStageArgs', () => {
  it('reads --apply and each live question to remove', () => {
    expect(
      parseStageArgs(['--remove', 'alpha-q', '--apply', '--remove', 'beta-q']),
    ).toEqual({ apply: true, remove: ['alpha-q', 'beta-q'] });
  });

  it('defaults to a dry run that removes nothing', () => {
    expect(parseStageArgs([])).toEqual({ apply: false, remove: [] });
  });

  it.each([
    [['--remove'], 'Missing value for --remove'],
    [['--remove', '--apply'], 'Missing value for --remove'],
    [['--remove', '*'], 'Invalid question QID: *'],
    [
      ['--remove', 'alpha-q', '--remove', 'alpha-q'],
      'Duplicate question QID: alpha-q',
    ],
    [['--apply', '--apply'], 'Unknown argument: --apply'],
  ] as const)('rejects %j', (argv, message) => {
    expect(() => parseStageArgs(argv)).toThrow(message);
  });
});
