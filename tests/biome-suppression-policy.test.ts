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
  fixtureRoot = mkdtempSync(join(tmpdir(), 'biome-suppression-policy-'));
  const config = JSON.parse(readFileSync('biome.json', 'utf8'));
  config.vcs.enabled = false;
  writeFileSync(join(fixtureRoot, 'biome.json'), JSON.stringify(config));
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function lint(filePath: string, contents: string) {
  const fixture = join(fixtureRoot, filePath);
  mkdirSync(dirname(fixture), { recursive: true });
  writeFileSync(fixture, contents);
  return spawnSync(biome, ['lint', '--error-on-warnings', filePath], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
}

const cases = [
  {
    name: 'Date retention comparison',
    filePath: 'src/domain/value-objects/renewal-consent.ts',
    flagged:
      'return terminationFloor > consentFloor ? terminationFloor : consentFloor;',
    unflagged:
      'return new Date(Math.max(terminationFloor.getTime(), consentFloor.getTime()));',
  },
  {
    name: 'displayed opt-in label',
    filePath: 'tests/e2e/helpers/checkout-consent.ts',
    flagged: "dialog.locator('form > label').innerText()",
    unflagged: "dialog.locator('form > label').textContent()",
  },
  {
    name: 'displayed consent sentence',
    filePath: 'tests/e2e/helpers/checkout-consent.ts',
    flagged: "dialog.locator('form > p').innerText()",
    unflagged: "dialog.locator('form > p').textContent()",
  },
];

describe.each(cases)(
  'Biome suppression for $name',
  ({ filePath, flagged, unflagged }) => {
    it('accepts the current intentional exception', () => {
      expect(lint(filePath, readFileSync(filePath, 'utf8')).status).toBe(0);
    });

    it('rejects the suppression once its expression no longer triggers the rule', () => {
      const source = readFileSync(filePath, 'utf8');
      expect(source).toContain(flagged);

      const result = lint(filePath, source.replace(flagged, unflagged));

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('suppressions/unused');
    });
  },
);
