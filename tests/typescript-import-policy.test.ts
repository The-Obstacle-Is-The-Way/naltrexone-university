import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const biome = resolve('node_modules/.bin/biome');
let fixtureRoot: string;

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'typescript-import-'));
  const config = JSON.parse(readFileSync('biome.json', 'utf8'));
  // The isolated fixture is not a Git repository; retain the real lint policy.
  config.vcs.enabled = false;
  writeFileSync(join(fixtureRoot, 'biome.json'), JSON.stringify(config));
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function lintTypeScriptImport(source: string) {
  const filePath = 'tests/typescript-import-fixture.ts';
  const fixture = join(fixtureRoot, filePath);
  mkdirSync(dirname(fixture), { recursive: true });
  writeFileSync(fixture, source);
  return spawnSync(biome, ['lint', filePath], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
}

// Canonical `typescript` is TypeScript 7, whose package root exports only
// version metadata (DEBT-460, issue #813). A source scanner importing it fails
// typecheck with errors that do not name the cause, so lint names it first.
describe('TypeScript compiler-API import boundary', () => {
  it('rejects the classic API from canonical typescript through real lint', () => {
    const result = lintTypeScriptImport(
      "import ts from 'typescript';\n\nexport const kind = ts.SyntaxKind;\n",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('lint/style/noRestrictedImports');
    expect(result.stderr).toContain('@typescript/typescript6');
  });

  it('allows the classic API from @typescript/typescript6', () => {
    expect(
      lintTypeScriptImport(
        "import ts from '@typescript/typescript6';\n\nexport const kind = ts.SyntaxKind;\n",
      ).status,
    ).toBe(0);
  });
});
