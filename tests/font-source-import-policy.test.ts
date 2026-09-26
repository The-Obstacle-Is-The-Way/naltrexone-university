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
  fixtureRoot = mkdtempSync(join(tmpdir(), 'font-source-import-'));
  const config = JSON.parse(readFileSync('biome.json', 'utf8'));
  // The isolated fixture is not a Git repository; retain the real lint policy.
  config.vcs.enabled = false;
  writeFileSync(join(fixtureRoot, 'biome.json'), JSON.stringify(config));
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function lintFontImport(source: string) {
  const filePath = 'app/font-fixture.ts';
  const fixture = join(fixtureRoot, filePath);
  mkdirSync(dirname(fixture), { recursive: true });
  writeFileSync(fixture, source);
  return spawnSync(biome, ['lint', filePath], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
}

// Four hosted builds failed on 2026-09-25 while next/font/google fetched the
// layout fonts, so builds read only the self-hosted files in app/fonts.
describe('font source boundary', () => {
  it('rejects next/font/google through real lint', () => {
    const result = lintFontImport(
      "import { Manrope } from 'next/font/google';\n\nexport const font = Manrope;\n",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('lint/style/noRestrictedImports');
  });

  it('allows next/font/local', () => {
    expect(
      lintFontImport(
        "import localFont from 'next/font/local';\n\nexport const font = localFont;\n",
      ).status,
    ).toBe(0);
  });
});
