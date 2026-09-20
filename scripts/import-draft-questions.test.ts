import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function draft(qid: string, source = 'fixture-source'): string {
  const data = {
    qid,
    type: 'recall',
    difficulty: 'easy',
    substances: ['alcohol'],
    topics: ['general'],
    source,
    choices: [
      { label: 'A', text: 'First option', correct: true },
      {
        label: 'B',
        text: 'Second option',
        correct: false,
        explanation: 'Reason.',
      },
    ],
  };
  return [
    '---',
    ...Object.entries(data).map(
      ([key, value]) => `${key}: ${JSON.stringify(value)}`,
    ),
    '---',
    '## Question',
    'Which example applies?',
    '## Explanation',
    'Synthetic explanation.',
    '### Reference',
    'Synthetic citation.',
  ].join('\n');
}

describe('draft import filesystem boundary', () => {
  let directory: string;
  let input: string;
  let output: string;
  let outside: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'draft-import-boundary-'));
    input = path.join(directory, 'input');
    output = path.join(directory, 'output');
    outside = path.join(directory, 'outside');
    mkdirSync(path.join(input, 'group'), { recursive: true });
    mkdirSync(outside);
    writeFileSync(path.join(input, 'group', 'recall.md'), draft('fixture-001'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function run(dryRun = false) {
    return spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/import-draft-questions.ts',
        '--in',
        input,
        '--out',
        output,
        ...(dryRun ? ['--dry-run'] : []),
      ],
      { encoding: 'utf8' },
    );
  }

  it('writes a valid document below the output root', () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('questions=1 written=1');
    expect(
      existsSync(
        path.join(output, 'group', 'fixture-source', 'fixture-001.mdx'),
      ),
    ).toBe(true);
  });

  it('preflights a later invalid source before writing any earlier document', () => {
    writeFileSync(
      path.join(input, 'group', 'recall.md'),
      [draft('fixture-001'), draft('fixture-002', '../../../../outside')].join(
        '\n',
      ),
    );
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('source must be a kebab-case identifier');
    expect(existsSync(output)).toBe(false);
  });

  it.each(['root', 'group', 'source'])(
    'rejects an existing symlink at the %s directory',
    (component) => {
      const target =
        component === 'root'
          ? output
          : component === 'group'
            ? path.join(output, 'group')
            : path.join(output, 'group', 'fixture-source');
      mkdirSync(path.dirname(target), { recursive: true });
      symlinkSync(outside, target, 'dir');
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('symlink');
      expect(existsSync(path.join(outside, 'fixture-001.mdx'))).toBe(false);
      expect(existsSync(path.join(outside, 'fixture-source'))).toBe(false);
      expect(existsSync(path.join(outside, 'group'))).toBe(false);
    },
  );

  it('rejects a symlinked destination file without overwriting its target', () => {
    const target = path.join(outside, 'protected.mdx');
    writeFileSync(target, 'sentinel');
    mkdirSync(path.join(output, 'group', 'fixture-source'), {
      recursive: true,
    });
    symlinkSync(
      target,
      path.join(output, 'group', 'fixture-source', 'fixture-001.mdx'),
    );
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('symlink');
    expect(readFileSync(target, 'utf8')).toBe('sentinel');
  });

  it('checks symlinks during dry runs without writing', () => {
    symlinkSync(outside, output, 'dir');
    const result = run(true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('symlink');
  });

  it('keeps valid dry runs read-only', () => {
    const result = run(true);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('questions=1 written=0 (dry-run)');
    expect(existsSync(output)).toBe(false);
  });
});
