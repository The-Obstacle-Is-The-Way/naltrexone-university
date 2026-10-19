import { describe, expect, it } from 'vitest';
import { parseQidCommandArgs } from './qid-command-args';

const RECORD = ['--reason', ' Under review ', '--authority', 'Clinical lead'];

describe('parseQidCommandArgs', () => {
  const holdId = '4afd2bbf-d161-49b3-ad3a-56a6bf37f580';

  it('accepts a named hold lift without a live question selector', () => {
    expect(
      parseQidCommandArgs(['--hold', holdId, '--lift', ...RECORD], {
        decision: 'hold',
        allowLift: true,
      }),
    ).toMatchObject({ qids: [], holdIds: [holdId], lift: true, apply: false });
  });

  it.each([
    [['--hold', holdId, ...RECORD], '--hold requires --lift'],
    [
      ['--hold', holdId, '--lift', '--qid', 'alpha-q', ...RECORD],
      'Use either --qid or --hold, not both',
    ],
    [['--hold', 'not-a-uuid', '--lift', ...RECORD], 'Invalid hold ID'],
    [
      ['--hold', holdId, '--hold', holdId, '--lift', ...RECORD],
      'Duplicate hold ID',
    ],
    [['--hold', '--lift', ...RECORD], 'Missing value for --hold'],
  ])('rejects an invalid named hold selector %j', (argv, message) => {
    expect(() =>
      parseQidCommandArgs(argv, { decision: 'hold', allowLift: true }),
    ).toThrow(message);
  });

  it('does not accept a hold selector for a withdrawal', () => {
    expect(() =>
      parseQidCommandArgs(['--hold', holdId, '--lift', ...RECORD], {
        decision: 'withdrawal',
      }),
    ).toThrow('Unknown argument: --hold');
  });

  it('reads named answer-key returns only for commands that allow them', () => {
    const argv = [
      '--qid',
      'alpha-q',
      ...RECORD,
      '--lift',
      '--revert',
      'alpha-q',
    ];
    expect(
      parseQidCommandArgs(argv, {
        decision: 'hold',
        allowLift: true,
        allowRevert: true,
      }).revert,
    ).toEqual(['alpha-q']);
    expect(() =>
      parseQidCommandArgs(argv, {
        decision: 'hold',
        allowLift: true,
      }),
    ).toThrow('Unknown argument: --revert');
  });

  it('reads QIDs, the trimmed record and --apply', () => {
    expect(
      parseQidCommandArgs(
        ['--qid', 'alpha-q', '--qid', 'beta-q', ...RECORD, '--apply'],
        {
          decision: 'hold',
        },
      ),
    ).toEqual({
      qids: ['alpha-q', 'beta-q'],
      apply: true,
      lift: false,
      revert: [],
      record: { reason: 'Under review', authority: 'Clinical lead' },
    });
  });

  it('defaults to a dry run', () => {
    expect(
      parseQidCommandArgs(['--qid', 'alpha-q', ...RECORD], { decision: 'hold' })
        .apply,
    ).toBe(false);
  });

  it('reads --lift only where it is allowed', () => {
    const argv = ['--qid', 'alpha-q', ...RECORD, '--lift'];

    expect(
      parseQidCommandArgs(argv, { decision: 'hold', allowLift: true }).lift,
    ).toBe(true);
    expect(() => parseQidCommandArgs(argv, { decision: 'withdrawal' })).toThrow(
      'Unknown argument: --lift',
    );
  });

  it.each([
    [[], 'At least one --qid is required'],
    [['--qid'], 'Missing value for --qid'],
    [['--qid', '--apply'], 'Missing value for --qid'],
    [['--qid', '*'], 'Invalid question QID: *'],
    [
      ['--qid', 'alpha-q', '--qid', 'alpha-q'],
      'Duplicate question QID: alpha-q',
    ],
    [
      ['--qid', 'alpha-q', '--authority', 'Owner'],
      '--reason is required: why the hold',
    ],
    [
      ['--qid', 'alpha-q', '--reason', 'Unsafe'],
      '--authority is required: who ordered the hold',
    ],
    [['--qid', 'alpha-q', '--reason'], 'Missing value for --reason'],
    [['--qid', 'alpha-q', '--authority', ' '], 'Missing value for --authority'],
    [
      ['--qid', 'alpha-q', '--reason', 'A', '--reason', 'B'],
      'Duplicate --reason',
    ],
    [['--qid', 'alpha-q', '--apply', '--apply'], 'Unknown argument: --apply'],
    [['--qid', 'alpha-q', '--all'], 'Unknown argument: --all'],
  ] as const)('rejects %j', (argv, message) => {
    expect(() =>
      parseQidCommandArgs(argv, { decision: 'hold', allowLift: true }),
    ).toThrow(message);
  });

  it('accepts --lift only once', () => {
    expect(() =>
      parseQidCommandArgs(['--qid', 'alpha-q', ...RECORD, '--lift', '--lift'], {
        decision: 'hold',
        allowLift: true,
      }),
    ).toThrow('Unknown argument: --lift');
  });
});
