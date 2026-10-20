import { describe, expect, it } from 'vitest';
import { parseActivateArgs } from './activate-release';
import { parseBootstrapArgs } from './bootstrap-release';
import { parseStageArgs } from './stage-release';

const RELEASE = '3f6c2a1e-8b4d-4c7a-9e2f-1a2b3c4d5e6f';
const ACTIVE = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const PLAN = 'c'.repeat(64);
// DEBT-490: every activation and bootstrap names why, and on whose authority.
const DECISION = ['--reason', 'October update', '--authority', 'Clinical lead'];
const RECORD = { reason: 'October update', authority: 'Clinical lead' };

describe('parseBootstrapArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseBootstrapArgs(DECISION)).toEqual({
      apply: false,
      expectedPlanId: undefined,
      record: RECORD,
    });
  });

  it('applies the plan a preview printed', () => {
    expect(
      parseBootstrapArgs([...DECISION, '--plan', PLAN, '--apply']),
    ).toEqual({ apply: true, expectedPlanId: PLAN, record: RECORD });
  });

  it.each([
    [[...DECISION, '--apply'], '--plan is required with --apply'],
    [['--plan'], '--plan needs the plan id a preview printed'],
    [['--plan', PLAN, '--plan', PLAN], 'Unknown argument: --plan'],
    [['--apply', '--apply'], 'Unknown argument: --apply'],
    [['--release'], 'Unknown argument: --release'],
    [[], '--reason is required: why the bootstrap'],
    [
      ['--reason', 'Adopt the live bank'],
      '--authority is required: who ordered the bootstrap',
    ],
    [['--reason'], 'Missing value for --reason'],
    [['--authority', '--apply'], 'Missing value for --authority'],
    [['--reason', 'a', '--reason', 'b'], 'Duplicate --reason'],
  ] as const)('rejects %j', (argv, message) => {
    expect(() => parseBootstrapArgs(argv)).toThrow(message);
  });
});

describe('parseActivateArgs', () => {
  it('reads the named answer-key returns for activation', () => {
    expect(
      parseActivateArgs([
        '--release',
        RELEASE,
        '--expect-active',
        ACTIVE,
        ...DECISION,
        '--revert',
        'alpha-q',
        '--revert',
        'beta-q',
      ]).revert,
    ).toEqual(['alpha-q', 'beta-q']);
  });

  it.each([
    [['--revert'], 'Missing value for --revert'],
    [['--revert', '*'], 'Invalid question QID: *'],
    [
      ['--revert', 'alpha-q', '--revert', 'alpha-q'],
      'Duplicate question QID: alpha-q',
    ],
  ] as const)(
    'rejects invalid activation return flags %j',
    (flags, message) => {
      expect(() =>
        parseActivateArgs([
          '--release',
          RELEASE,
          '--expect-active',
          ACTIVE,
          ...DECISION,
          ...flags,
        ]),
      ).toThrow(message);
    },
  );

  it('reads the release, the expected active release, the plan and --apply', () => {
    expect(
      parseActivateArgs([
        '--release',
        RELEASE,
        '--expect-active',
        ACTIVE,
        ...DECISION,
        '--plan',
        PLAN,
        '--apply',
      ]),
    ).toEqual({
      releaseId: RELEASE,
      expectedActiveReleaseId: ACTIVE,
      expectedPlanId: PLAN,
      revert: [],
      record: RECORD,
      apply: true,
    });
  });

  it('refuses --repo without a repository path', () => {
    expect(() =>
      parseActivateArgs([
        '--release',
        RELEASE,
        '--expect-active',
        ACTIVE,
        ...DECISION,
        '--repo',
      ]),
    ).toThrow(/--repo needs a repository path/);
  });
  it('reads --expect-active none as no active release', () => {
    expect(
      parseActivateArgs([
        '--release',
        RELEASE,
        '--expect-active',
        'none',
        ...DECISION,
      ]),
    ).toEqual({
      releaseId: RELEASE,
      expectedActiveReleaseId: null,
      expectedPlanId: undefined,
      revert: [],
      record: RECORD,
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
      ['--release', RELEASE, '--expect-active', 'none', ...DECISION, '--apply'],
      '--plan is required with --apply',
    ],
    [
      ['--release', RELEASE, '--expect-active', 'none'],
      '--reason is required: why the activation',
    ],
    [
      ['--release', RELEASE, '--expect-active', 'none', '--reason', 'Update'],
      '--authority is required: who ordered the activation',
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
  const sourceArgs = ['--repo', '/fixture', '--commit', 'a'.repeat(40)];
  const source = {
    repository: '/fixture',
    commit: 'a'.repeat(40),
    draft: [],
    archive: [],
  };
  it('requires an explicit repository and full source commit', () => {
    expect(() => parseStageArgs([])).toThrow(
      /--repo and --commit are required/,
    );
    expect(() =>
      parseStageArgs(['--repo', '/fixture', '--commit', 'main']),
    ).toThrow(/full/);
  });
  it('refuses a missing repository path and a short baseline', () => {
    expect(() => parseStageArgs(['--repo'])).toThrow(
      /--repo needs a repository path/,
    );
    expect(() => parseStageArgs([...sourceArgs, '--baseline', 'main'])).toThrow(
      /--baseline needs a full lowercase commit ID/,
    );
  });
  it('reads the verified baseline for the first release after the bootstrap', () => {
    expect(
      parseStageArgs([...sourceArgs, '--baseline', 'b'.repeat(40)]),
    ).toMatchObject({ baseline: 'b'.repeat(40) });
  });
  it('names draft and permanent archive dispositions for commit-derived questions', () => {
    expect(
      parseStageArgs([
        ...sourceArgs,
        '--draft',
        'alpha-q',
        '--archive',
        'beta-q',
      ]),
    ).toMatchObject({ draft: ['alpha-q'], archive: ['beta-q'] });
  });
  it('refuses two dispositions for one question', () => {
    expect(() =>
      parseStageArgs([
        ...sourceArgs,
        '--draft',
        'alpha-q',
        '--archive',
        'alpha-q',
      ]),
    ).toThrow(/one disposition/);
  });
  it('reads --apply and each live question to remove', () => {
    expect(
      parseStageArgs([
        ...sourceArgs,
        '--remove',
        'alpha-q',
        '--apply',
        '--remove',
        'beta-q',
      ]),
    ).toEqual({
      ...source,
      apply: true,
      remove: ['alpha-q', 'beta-q'],
      revert: [],
    });
  });

  // DEBT-492: each question the bundle moves back to an earlier revision.
  it('reads each question to revert', () => {
    expect(
      parseStageArgs([
        ...sourceArgs,
        '--revert',
        'alpha-q',
        '--revert',
        'beta-q',
      ]),
    ).toEqual({
      ...source,
      apply: false,
      remove: [],
      revert: ['alpha-q', 'beta-q'],
    });
  });

  it('defaults to a dry run that removes and reverts nothing', () => {
    expect(parseStageArgs([...sourceArgs])).toEqual({
      ...source,
      apply: false,
      remove: [],
      revert: [],
    });
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
    [['--revert'], 'Missing value for --revert'],
    [['--revert', '*'], 'Invalid question QID: *'],
    [
      ['--revert', 'alpha-q', '--revert', 'alpha-q'],
      'Duplicate question QID: alpha-q',
    ],
  ] as const)('rejects %j', (argv, message) => {
    expect(() => parseStageArgs(argv)).toThrow(message);
  });
});
