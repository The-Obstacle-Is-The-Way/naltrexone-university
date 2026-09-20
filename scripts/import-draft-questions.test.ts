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

  describe.each([false, true])('clean staging (dryRun=%s)', (dryRun) => {
    it.each(['current-qid', 'stale-qid', 'hidden-file'])(
      'refuses a populated output root containing %s without changing it',
      (existingKind) => {
        const destination = path.join(
          output,
          'group',
          'fixture-source',
          'fixture-001.mdx',
        );
        const existing =
          existingKind === 'current-qid'
            ? destination
            : existingKind === 'stale-qid'
              ? path.join(output, 'old-source', 'withdrawn-qid.mdx')
              : path.join(output, '.sentinel');
        mkdirSync(path.dirname(existing), { recursive: true });
        writeFileSync(existing, 'Existing output must survive unchanged');

        const result = run(dryRun);

        expect(result.status, result.stdout).toBe(1);
        expect(result.stderr).toMatch(/output root.*not empty/i);
        expect(result.stderr).toContain('fresh staging directory');
        expect(readFileSync(existing, 'utf8')).toBe(
          'Existing output must survive unchanged',
        );
        if (existingKind !== 'current-qid') {
          expect(existsSync(destination)).toBe(false);
        }
      },
    );
  });

  it('accepts an existing empty staging directory', () => {
    mkdirSync(output);

    const result = run();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('questions=1 written=1');
    expect(
      readFileSync(
        path.join(output, 'group', 'fixture-source', 'fixture-001.mdx'),
        'utf8',
      ),
    ).toContain('Which example applies?');
  });

  it.each([false, true])(
    'rejects a discovered empty file before writes (dryRun=%s)',
    (dryRun) => {
      const emptyFile = path.join(input, 'group', 'vignettes.md');
      writeFileSync(emptyFile, '# No questions\n');
      const result = run(dryRun);
      expect(result.status, result.stdout).toBe(1);
      expect(result.stderr).toContain(emptyFile);
      expect(result.stderr).toMatch(/no question blocks/i);
      expect(existsSync(output)).toBe(false);
    },
  );

  it.each([false, true])(
    'rejects a later reordered block before writes (dryRun=%s)',
    (dryRun) => {
      const file = path.join(input, 'group', 'recall.md');
      const reordered = draft('fixture-002').replace(
        'qid: "fixture-002"\ntype: "recall"',
        'type: "recall"\nqid: "fixture-002"',
      );
      writeFileSync(file, `${draft('fixture-001')}\n${reordered}`);
      const result = run(dryRun);
      expect(result.status, result.stdout).toBe(1);
      expect(result.stderr).toContain(file);
      expect(result.stderr).toMatch(/line \d+.*qid.*first/i);
      expect(existsSync(output)).toBe(false);
    },
  );

  describe.each([false, true])('identity preflight (dryRun=%s)', (dryRun) => {
    it.each(['same-file', 'cross-file', 'cross-source', 'cross-family'])(
      'rejects %s duplicate QIDs with both block locations before writes',
      (scenario) => {
        const first = path.join(input, 'group', 'recall.md');
        const second =
          scenario === 'same-file'
            ? first
            : scenario === 'cross-family'
              ? path.join(input, 'other-group', 'recall.md')
              : path.join(input, 'group', 'vignettes.md');
        const duplicate = draft(
          'fixture-001',
          scenario === 'cross-source' ? 'other-source' : 'fixture-source',
        );
        mkdirSync(path.dirname(second), { recursive: true });
        writeFileSync(
          second,
          scenario === 'same-file'
            ? `${draft('fixture-001')}\n${duplicate}`
            : duplicate,
        );

        const result = run(dryRun);

        expect(result.status, result.stdout).toBe(1);
        expect(result.stderr).toContain('Duplicate QID "fixture-001"');
        expect(result.stderr).toContain(`${first} (block 1)`);
        expect(result.stderr).toContain(
          `${second} (block ${scenario === 'same-file' ? 2 : 1})`,
        );
        expect(existsSync(output)).toBe(false);
      },
    );
  });

  it('preserves existing output when a duplicate is discovered', () => {
    const existing = path.join(
      output,
      'group',
      'fixture-source',
      'fixture-001.mdx',
    );
    mkdirSync(path.dirname(existing), { recursive: true });
    writeFileSync(existing, 'Existing published content');
    writeFileSync(
      path.join(input, 'group', 'vignettes.md'),
      draft('fixture-001'),
    );

    const result = run();

    expect(result.status, result.stdout).toBe(1);
    expect(readFileSync(existing, 'utf8')).toBe('Existing published content');
  });

  it('imports distinct QIDs across files and reports the distinct count', () => {
    writeFileSync(
      path.join(input, 'group', 'vignettes.md'),
      draft('fixture-002'),
    );

    const result = run();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('files=2 questions=2 written=2');
    expect(result.stdout).toContain('uniqueQids=2');
    for (const qid of ['fixture-001', 'fixture-002']) {
      expect(
        existsSync(path.join(output, 'group', 'fixture-source', `${qid}.mdx`)),
      ).toBe(true);
    }
  });

  it.each([false, true])(
    'rejects a later uncited body before writing (dryRun=%s)',
    (dryRun) => {
      writeFileSync(
        path.join(input, 'group', 'vignettes.md'),
        draft('fixture-002').replace('### Reference\nSynthetic citation.', ''),
      );
      const result = run(dryRun);
      expect(result.status, result.stdout).toBe(1);
      expect(result.stderr).toMatch(/reference.*required/i);
      expect(existsSync(output)).toBe(false);
    },
  );
});
