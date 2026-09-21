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
  fixtureRoot = mkdtempSync(join(tmpdir(), 'architecture-lint-'));
  const config = JSON.parse(readFileSync('biome.json', 'utf8'));
  config.vcs.enabled = false;
  writeFileSync(join(fixtureRoot, 'biome.json'), JSON.stringify(config));
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function lint(filePath: string, contents = 'export {};\n') {
  const fixture = join(fixtureRoot, filePath);
  mkdirSync(dirname(fixture), { recursive: true });
  writeFileSync(fixture, contents);
  return spawnSync(biome, ['lint', filePath], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
}

describe('architecture import lint policy', () => {
  it.each([
    "import { z } from 'zod'; export { z };",
    "import 'server-only';",
    "export { helper } from '@/src/application/shared/helper';",
    "export { User } from '@/src/domain/entities';",
    "export const load = () => import('next/cache');",
  ])('rejects non-relative domain imports: %s', (contents) => {
    const result = lint('src/domain/entities/example.ts', contents);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('lint/style/noRestrictedImports');
  });

  it.each([
    'react',
    'stripe',
    '@noble/hashes/sha2',
    'server-only',
    '@/src/adapters/controllers/question-controller',
    '@/app/layout',
    '@/components/example',
    '@/lib/env',
    '@/db',
    '@/db/schema',
  ])('rejects the application specifier %s', (specifier) => {
    const result = lint(
      'src/application/use-cases/example.ts',
      `export type { Example } from '${specifier}';`,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('lint/style/noRestrictedImports');
  });

  it.each(['@/app/layout', '@/components/example'])(
    'rejects the adapter specifier %s',
    (specifier) => {
      const result = lint(
        'src/adapters/controllers/example.ts',
        `export { example } from '${specifier}';`,
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('lint/style/noRestrictedImports');
    },
  );

  it.each([
    ['src/domain/entities/example.ts', "export { User } from './user';"],
    ['src/domain/entities/example.ts', "export { User } from '../user';"],
    [
      'src/application/use-cases/example.ts',
      "export type { User } from '@/src/domain/entities';",
    ],
    [
      'src/application/use-cases/example.ts',
      "export { helper } from '../shared/helper';",
    ],
    ['src/adapters/controllers/example.ts', "export { z } from 'zod';"],
    ['src/adapters/controllers/example.ts', "export { db } from '@/db';"],
    ['src/domain/entities/example.test.ts', "import 'vitest';"],
    ['src/application/test-helpers/example.ts', "import 'vitest';"],
    ['tests/e2e/global.setup.ts', "import 'vitest';"],
  ])('preserves the allowed import at %s: %s', (filePath, contents) => {
    expect(lint(filePath, contents).status).toBe(0);
  });
});

describe('repository filename lint policy', () => {
  it.each([
    'components/question/QuestionCard.test.tsx',
    'lib/content/parseMdxQuestion.ts',
    'scripts/unapproved.extra.ts',
    'tests/unapproved.fixtures.ts',
  ])('rejects the previously forbidden filename %s', (filePath) => {
    const result = lint(filePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('lint/style/useFilenamingConvention');
  });

  it.each([
    'src/domain/entities/example.ts',
    'components/example.tsx',
    'tests/example.test.ts',
    'components/example.test.tsx',
    'tests/example.spec.ts',
    'tests/example.e2e.ts',
    'components/example.browser.spec.tsx',
    'tests/integration/example.integration.test.ts',
    'app/(app)/app/billing/page.manage-billing.test.tsx',
    'app/(app)/app/practice/[sessionId]/components/post-exam-review-view.fixtures.ts',
    'app/(app)/app/practice/[sessionId]/hooks/practice-session-page-model.browser.fixtures.ts',
    'app/(app)/app/practice/[sessionId]/hooks/practice-session-page-model.browser.probes.tsx',
    'app/(app)/app/practice/[sessionId]/hooks/practice-session-page-model.browser.setup.ts',
    'app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.fixtures.ts',
    'app/(app)/app/questions/[slug]/hooks/question-page-model.browser.fixtures.ts',
    'lib/container.skip-clerk.test.ts',
    'tests/e2e/global.setup.ts',
    'tests/integration/actions.stripe.integration.test.ts',
  ])('preserves the standard or already-exempt filename %s', (filePath) => {
    expect(lint(filePath).status).toBe(0);
  });
});
