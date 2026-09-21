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
  fixtureRoot = mkdtempSync(join(tmpdir(), 'raw-button-policy-'));
  const config = JSON.parse(readFileSync('biome.json', 'utf8'));
  // Only Git discovery differs from the repository's actual lint policy.
  config.vcs.enabled = false;
  writeFileSync(join(fixtureRoot, 'biome.json'), JSON.stringify(config));
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function lintElement(filePath: string, element = 'button') {
  const fixture = join(fixtureRoot, filePath);
  mkdirSync(dirname(fixture), { recursive: true });
  writeFileSync(
    fixture,
    `${element === 'Button' ? "import { Button } from './ui/button';\n" : ''}export function Example() { return <${element}\n type="button" />; }\n`,
  );
  return spawnSync(biome, ['lint', filePath], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
}

describe('production raw button lint policy', () => {
  it.each(['app/example/page.tsx', 'components/example-cta.tsx'])(
    'rejects a raw JSX button in %s',
    (filePath) => {
      const result = lintElement(filePath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('lint/correctness/noRestrictedElements');
    },
  );

  it('allows the design-system Button in production', () => {
    expect(lintElement('components/example-cta.tsx', 'Button').status).toBe(0);
  });

  it.each([
    'components/ui/button.tsx',
    'components/mobile-nav.tsx',
    'components/example.test.tsx',
    'components/example.browser.spec.tsx',
    'components/example-test-helpers.tsx',
    'components/example.probes.tsx',
    'app/example/example.test.tsx',
    'app/example/example.browser.spec.tsx',
    'app/example/example-test-helpers.tsx',
    'app/example/example.probes.tsx',
  ])('preserves the existing scanner exclusion at %s', (filePath) => {
    expect(lintElement(filePath).status).toBe(0);
  });
});
