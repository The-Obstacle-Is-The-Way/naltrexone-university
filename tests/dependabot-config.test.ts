import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type Group = {
  'applies-to'?: string;
  patterns?: string[];
  'exclude-patterns'?: string[];
  'update-types'?: string[];
};

type Update = {
  'package-ecosystem': string;
  'target-branch'?: string;
  groups?: Record<string, Group>;
};

const config = parse(readFileSync('.github/dependabot.yml', 'utf8')) as {
  updates: Update[];
};

const devNpmGroups = (): Record<string, Group> => {
  const entry = config.updates.find(
    (update) =>
      update['package-ecosystem'] === 'npm' &&
      update['target-branch'] === 'dev',
  );
  return entry?.groups ?? {};
};

// DEBT-500: a lone `vitest` major mixed majors with `@vitest/*` and failed
// typecheck (#1370). The first-party packages and their React adapter move
// in one pull request, majors included.
describe('Dependabot version updates for Vitest', () => {
  const VITEST_PACKAGES = ['vitest', '@vitest/*', 'vitest-browser-react'];

  it('groups vitest, @vitest/* and vitest-browser-react, majors included', () => {
    expect(devNpmGroups().vitest).toEqual({
      'applies-to': 'version-updates',
      patterns: VITEST_PACKAGES,
      'update-types': ['minor', 'patch', 'major'],
    });
  });

  it('keeps them out of the routine minor-and-patch group', () => {
    expect(devNpmGroups()['npm-minor-and-patch']?.['exclude-patterns']).toEqual(
      expect.arrayContaining(VITEST_PACKAGES),
    );
  });
});
