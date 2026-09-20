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
  fixtureRoot = mkdtempSync(join(tmpdir(), 'server-tracing-import-'));
  const config = JSON.parse(readFileSync('biome.json', 'utf8'));
  // The isolated fixture is not a Git repository; retain the real lint policy.
  config.vcs.enabled = false;
  writeFileSync(join(fixtureRoot, 'biome.json'), JSON.stringify(config));
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function lintSentryImport(filePath: string) {
  const fixture = join(fixtureRoot, filePath);
  mkdirSync(dirname(fixture), { recursive: true });
  writeFileSync(fixture, "import '@sentry/nextjs';\n");
  return spawnSync(biome, ['lint', filePath], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
}

describe('server tracing import boundary', () => {
  it('rejects a direct Sentry import in a controller through real lint', () => {
    const result = lintSentryImport(
      'src/adapters/controllers/tracing-fixture.ts',
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('lint/style/noRestrictedImports');
  });

  it.each([
    'src/adapters/shared/server-tracing.ts',
    'instrumentation.ts',
    'sentry.client.config.ts',
    'lib/report-client-error.ts',
    'vitest.browser.setup.ts',
  ])('allows the approved SDK boundary at %s', (filePath) => {
    expect(lintSentryImport(filePath).status).toBe(0);
  });
});
