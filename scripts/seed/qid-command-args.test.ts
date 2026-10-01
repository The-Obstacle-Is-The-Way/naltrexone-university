import { describe, expect, it } from 'vitest';
import { parseQidCommandArgs } from './qid-command-args';

const RECORD = ['--reason', ' Under review ', '--authority', 'Clinical lead'];

describe('parseQidCommandArgs', () => {
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
