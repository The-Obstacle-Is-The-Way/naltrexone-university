import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { entryPointPolicyIssues } from './script-entry-policy';
import { readScriptFiles } from './scripts-directory-source-scan';

const temporary: string[] = [];
afterEach(() => {
  for (const folder of temporary.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

function run(file: string, args: string[] = []) {
  return spawnSync(process.execPath, ['--import', 'tsx', file, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, NODE_ENV: 'test' },
  });
}

describe('script entry detection', () => {
  it.each([
    'scripts/records/next-record-id.ts',
    'scripts/records/next-record-id',
  ])('executes the record allocator via %s', (file) => {
    const result = run(file, ['debt']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toMatch(/^DEBT-\d+$/);
  });

  it('executes a symlink to the record allocator', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'script-entry-'));
    temporary.push(directory);
    const link = path.join(directory, 'record.ts');
    symlinkSync(path.resolve('scripts/records/next-record-id.ts'), link);
    const result = run(link, ['debt']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toMatch(/^DEBT-\d+$/);
  });

  it('does not run an imported sibling when a distinct extensionless entry file exists', () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'script-entry-existing-'),
    );
    temporary.push(directory);
    const entry = path.join(directory, 'tool');
    writeFileSync(entry, "import './tool.ts';\n");
    writeFileSync(
      `${entry}.ts`,
      [
        `import { isMain } from ${JSON.stringify(path.resolve('scripts/lib/entry-point.mts'))};`,
        "if (isMain(import.meta.url)) console.log('imported command body ran');",
      ].join('\n'),
    );
    const result = run(entry);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it.each([
    'review/merge-reviewed-pr',
    'review/verify-promotion',
    'content-release/activate-release',
  ])(
    'does not silently pass an invalid extensionless %s invocation',
    (file) => {
      const result = run(`scripts/${file}`, ['--invalid']);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/argument|usage|required/i);
    },
  );

  it('accepts pnpm 11 leading separators for the record allocator', () => {
    const result = run('scripts/records/next-record-id.ts', ['--', 'debt']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toMatch(/^DEBT-\d+$/);
  });
});

// These thin commands deliberately run unconditionally and must never be
// imported as libraries. Every other executable module uses the shared check.
const UNCONDITIONAL = new Set([
  'import-draft-questions.ts',
  'seed-production.ts',
  'seed-all-environments.ts',
  'dependencies/verify-lockfile-union.ts',
]);

describe('entry point policy', () => {
  it('keeps every guarded entry point on the shared real-path check', () => {
    const failures = readScriptFiles().filter((file) => {
      if (!/\.[cm]?ts$/.test(file) || file === 'lib/entry-point.mts')
        return false;
      const source = readFileSync(path.join('scripts', file), 'utf8');
      if (UNCONDITIONAL.has(file)) return false;
      return (
        entryPointPolicyIssues(source, path.join('scripts', file)).length > 0
      );
    });
    expect(failures).toEqual([]);
  });
});

const helperImport = "import { isMain } from '../scripts/lib/entry-point.mts';";
describe('entry point source policy controls', () => {
  it.each([
    '// if (isMain(import.meta.url)) {}',
    'const text = "if (isMain(import.meta.url)) {}";',
    'function unused() { if (isMain(import.meta.url)) {} }',
    'if (false) { if (isMain(import.meta.url)) {} }',
    'if (isMain("another-file")) {}',
  ])('rejects a non-entry check: %s', (guard) => {
    expect(
      entryPointPolicyIssues(
        `${helperImport}\n${guard}\nconst argv = process.argv;`,
        'tests/tool.ts',
      ),
    ).not.toEqual([]);
  });
  it('rejects a lookalike import from another module', () => {
    expect(
      entryPointPolicyIssues(
        "import { isMain } from './other'; if (isMain(import.meta.url)) {}",
        'tests/tool.ts',
      ),
    ).not.toEqual([]);
  });
  it('accepts the actual top-level shared check and ignores mentions in comments', () => {
    expect(
      entryPointPolicyIssues(
        `${helperImport} if (isMain(import.meta.url)) { main(process.argv); }`,
        'tests/tool.ts',
      ),
    ).toEqual([]);
    expect(
      entryPointPolicyIssues(
        '// process.argv and import.meta.url',
        'tests/library.ts',
      ),
    ).toEqual([]);
  });
});

const operatorCommands = {
  'pr:merge-reviewed': 'review/merge-reviewed-pr.ts',
  'pr:verify-promotion': 'review/verify-promotion.ts',
  'record:next': 'records/next-record-id.ts',
  'content:release:bootstrap': 'content-release/bootstrap-release.ts',
  'content:release:stage': 'content-release/stage-release.ts',
  'content:release:activate': 'content-release/activate-release.ts',
  'content:hold': 'content-release/hold-questions.ts',
  'content:keys:compare': 'content-release/compare-live-keys.ts',
  'content:census:key-returns': 'content-release/census-key-returns.ts',
  'content:census:normalization': 'content-release/census-normalization.ts',
  'content:withdraw': 'seed/withdraw-questions.ts',
  'db:verify-ledger': 'database/verify-migration-ledger.ts',
  'docs:audit': 'records/documentation-archive.ts',
  'secret:check-header': 'deploy/validate-header-safe-secret.ts',
  'deps:verify-union': 'dependencies/verify-lockfile-union.ts',
};

describe('operator package commands', () => {
  it.each(Object.entries(operatorCommands))(
    'wires %s to %s',
    (command, file) => {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      expect(pkg.scripts[command]).toBe(`tsx scripts/${file}`);
    },
  );
  it('accepts a leading separator for the existing local target command', () => {
    const result = run('scripts/test-lanes/resolve-local-test-target.ts', [
      '--',
      'database-url',
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^postgresql:/);
  });
  it.each([
    'review/merge-reviewed-pr.ts',
    'review/verify-promotion.ts',
    'content-release/bootstrap-release.ts',
    'content-release/stage-release.ts',
    'content-release/activate-release.ts',
    'content-release/hold-questions.ts',
    'seed/withdraw-questions.ts',
    'database/verify-migration-ledger.ts',
  ])(
    'preserves the real diagnostic after a leading separator for %s',
    (file) => {
      const plain = run(`scripts/${file}`, ['--invalid']);
      const separated = run(`scripts/${file}`, ['--', '--invalid']);
      expect(plain.status).toBe(1);
      expect(separated.status).toBe(1);
      // Stacks contain dynamic line positions; compare the actionable error line.
      const diagnostic = (text: string) =>
        text
          .split('\n')
          .find((line) =>
            /^(Error:|Usage:|Unknown|Unexpected|Invalid)/.test(line),
          );
      expect(diagnostic(separated.stderr), separated.stderr).toBe(
        diagnostic(plain.stderr),
      );
      expect(diagnostic(plain.stderr), plain.stderr).toBeTruthy();
    },
  );
});

describe('native entry checks without installed packages', () => {
  it('executes direct and symlink .mts entries but never imports', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'native-entry-'));
    temporary.push(directory);
    const target = path.join(directory, 'command.mts');
    writeFileSync(
      target,
      `${helperImport.replace('../scripts', path.resolve('scripts'))} if (isMain(import.meta.url)) console.log('executed');`,
    );
    const importer = path.join(directory, 'importer.mts');
    writeFileSync(importer, "import './command.mts';");
    const link = path.join(directory, 'linked.mts');
    symlinkSync(target, link);
    for (const file of [target, link, importer]) {
      const result = spawnSync(process.execPath, [file], {
        cwd: directory,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, NODE_ENV: 'test' },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe(file === importer ? '' : 'executed\n');
    }
  });
});
