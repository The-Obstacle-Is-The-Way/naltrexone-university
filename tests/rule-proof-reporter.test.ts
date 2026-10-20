import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

function runProof(
  source: string,
  title = 'proof',
  args: string[] = [],
  config = '',
  helpers: Record<string, string> = {},
) {
  const root = mkdtempSync(path.join(tmpdir(), 'rule-proof-'));
  folders.push(root);
  symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'));
  for (const [file, contents] of Object.entries(helpers))
    writeFileSync(path.join(root, file), contents);
  writeFileSync(
    path.join(root, 'proof.test.ts'),
    `import { it, describe, expect } from 'vitest';\n${source}\nit('unrelated', () => {});`,
  );
  const register = path.join(root, 'register.md');
  writeFileSync(
    register,
    `### R1. A rule.\n- \`proof.test.ts\`: \`${title}\`\n`,
  );
  writeFileSync(
    path.join(root, 'vitest.config.mts'),
    `import { defineConfig } from 'vitest/config';
import { RuleProofReporter } from ${JSON.stringify(path.resolve('tests/rule-proof-reporter.mts'))};
export default defineConfig({ test: { allowOnly: false, includeTaskLocation: true, ${config} reporters: ['dot', new RuleProofReporter('unit', ${JSON.stringify(register)})] } });`,
  );
  return spawnSync(
    process.execPath,
    [path.resolve('node_modules/vitest/vitest.mjs'), 'run', ...args],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 8_000,
      env: { PATH: process.env.PATH, NODE_ENV: 'test', CI: '1', NO_COLOR: '1' },
    },
  );
}

const annotation = `{ meta: { ruleProof: { file: 'proof.test.ts', title: 'proof %i' } } }`;

describe('executed rule proofs through the real Vitest reporter', () => {
  it.each([
    "const ruleProof = { file: 'proof.test.ts', title: 'proof %i' }; it.each([1])('different %i', { meta: { ruleProof } }, () => {});",
    "it.each([1])('different %i', { meta: { ['ruleProof']: { file: 'proof.test.ts', title: 'proof %i' } } }, () => {});",
  ])('rejects unsupported metadata keys: %s', (impersonator) => {
    const result = runProof(
      `it.each([])('proof %i', ${annotation}, () => {}); ${impersonator}`,
      'proof %i',
    );
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout + result.stderr).toContain('Rule proof audit failed');
  });
  it('rejects an imported helper impersonating an uncalled plain proof', () => {
    const result = runProof(
      "import { other } from './helper'; function unused() { it('proof', () => {}); } other();",
      'proof',
      [],
      '',
      {
        'helper.ts':
          "import { it } from 'vitest'; export function other() { it('proof', () => {}); }",
      },
    );
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout + result.stderr).toContain('Rule proof audit failed');
  });
  it('rejects copied metadata in an imported helper', () => {
    const result = runProof(
      `import { other } from './helper'; it.each([])('proof %i', ${annotation}, () => {}); other();`,
      'proof %i',
      [],
      '',
      {
        'helper.ts': `import { it } from 'vitest'; export function other() { it.each([1])('different test %i', ${annotation}, () => {}); }`,
      },
    );
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout + result.stderr).toContain('Rule proof audit failed');
  });
  it('rejects a helper forwarding proof metadata to another declaration', () => {
    const result = runProof(
      `it.each([])('proof %i', ${annotation}, () => {}); function forward(_title, options) { it.each([1])('different test %i', options, () => {}); } forward('proof %i', ${annotation});`,
      'proof %i',
    );
    expect(result.status, result.stdout + result.stderr).toBe(1);
  });
  it.each([
    [
      'an uncalled function',
      "function unused() { it('proof', () => {}); }",
      'proof',
    ],
    [
      'a zero-iteration loop',
      "while (false) { it('proof', () => {}); }",
      'proof',
    ],
    [
      'code after return',
      "describe('suite', () => { return; it('proof', () => {}); });",
      'proof',
    ],
    [
      'an empty table',
      `it.each([])('proof %i', ${annotation}, () => {});`,
      'proof %i',
    ],
    [
      'a dynamically skipped test',
      "it('proof', ctx => { ctx.skip(); });",
      'proof',
    ],
    ['an exclusive test', "it.only('proof', () => {});", 'proof'],
    [
      'an ambiguous title',
      "describe('a', () => it('proof', () => {})); describe('b', () => it('proof', () => {}));",
      'proof',
    ],
    [
      'a parameterized test without metadata',
      "it.each([1,2])('proof %i', () => {});",
      'proof %i',
    ],
    [
      'a plain test impersonating an empty proof',
      `it.each([])('proof %i', ${annotation}, () => {}); it('different test', ${annotation}, () => {});`,
      'proof %i',
    ],
    [
      'another table impersonating an empty proof',
      `it.each([])('proof %i', ${annotation}, () => {}); it.each([1])('different test %i', ${annotation}, () => {});`,
      'proof %i',
    ],
    [
      'another table impersonating an uncalled proof',
      `function unused() { it.each([1])('proof %i', ${annotation}, () => {}); } it.each([1])('different test %i', ${annotation}, () => {});`,
      'proof %i',
    ],
    [
      'one skipped generated case',
      `it.each([1,2])('proof %i', ${annotation}, (n, ctx) => { if(n === 2) ctx.skip(); });`,
      'proof %i',
    ],
  ])('rejects %s', (_name, source, title) => {
    const result = runProof(source, title);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout + result.stderr).toContain('Rule proof audit failed');
  });

  it.each([
    ["it('proof', () => {});", 'proof'],
    ["describe('suite', () => it('proof', () => {}));", 'proof'],
    [
      `it.each([1,2])('proof %i', ${annotation}, n => { expect(n).toBeGreaterThan(0); });`,
      'proof %i',
    ],
  ])('accepts executed proofs: %s', (source, title) => {
    const result = runProof(source, title);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout + result.stderr).toContain('Rule proofs: unit passed');
  });

  it.each([
    ['--exclude', 'unrelated.test.ts'],
    ['-t', 'proof'],
  ])('does not attest a filtered command: %s', (...args) => {
    const result = runProof("it('proof', () => {});", 'proof', args);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout + result.stderr).toContain(
      'Rule proofs: unit SKIPPED',
    );
  });

  it('fails a canonical run when its configuration silently filters tests', () => {
    const result = runProof(
      "it('proof', { tags: ['required'] }, () => {});",
      'proof',
      [],
      "tags: [{ name: 'required' }], tagsFilter: ['required'],",
    );
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout + result.stderr).toContain('Rule proof audit failed');
  });

  it('rejects an empty run even when Vitest itself permits no tests', () => {
    const result = runProof(
      "it('proof', () => {});",
      'proof',
      ['--passWithNoTests'],
      "include: ['nothing.test.ts'],",
    );
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout + result.stderr).toContain('Rule proof audit failed');
  });

  it('marks a focused run as an unaudited run, without a full-lane success receipt', () => {
    const result = runProof("it('proof', () => {});", 'proof', [
      'proof.test.ts',
    ]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout + result.stderr).toContain(
      'Rule proofs: unit SKIPPED',
    );
    expect(result.stdout + result.stderr).not.toContain(
      'Rule proofs: unit passed',
    );
  });
});
