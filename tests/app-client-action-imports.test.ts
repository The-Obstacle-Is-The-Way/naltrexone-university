import { readFileSync } from 'node:fs';
import { globSync } from 'tinyglobby';
import { describe, expect, it } from 'vitest';

// BUG-365: app code calls server actions through the entitlement-aware client
// module, which sends a learner who lost their subscription to Pricing. A
// direct import would skip that redirect.
const CLIENT_ACTIONS_MODULE = 'app/(app)/app/shared/client-actions.ts';
const DIRECT_ACTION_IMPORT =
  /from\s+['"]@\/src\/adapters\/controllers\/[a-z-]+-actions['"]/;

function directActionImports(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(
      ([file, source]) =>
        file !== CLIENT_ACTIONS_MODULE && DIRECT_ACTION_IMPORT.test(source),
    )
    .map(([file]) => file)
    .sort();
}

describe('app client action imports', () => {
  it('reports a page module that imports a server action directly', () => {
    expect(
      directActionImports({
        'app/(app)/app/x/hooks/use-x.ts':
          "import { getTags } from '@/src/adapters/controllers/tag-actions';",
        [CLIENT_ACTIONS_MODULE]:
          "import * as tagActions from '@/src/adapters/controllers/tag-actions';",
        'app/(app)/app/x/hooks/use-y.ts':
          "import { getTags } from '@/app/(app)/app/shared/client-actions';",
      }),
    ).toEqual(['app/(app)/app/x/hooks/use-x.ts']);
  });

  it('routes every app page action through the client actions module', () => {
    // The route group's parentheses are glob syntax, so it is the base path.
    const files = globSync('**/*.{ts,tsx}', {
      cwd: 'app/(app)/app',
      ignore: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.browser.spec.tsx',
        '**/*.browser.setup.ts',
        '**/*-test-helpers.ts',
        '**/*-test-helpers.tsx',
      ],
    }).map((file) => `app/(app)/app/${file}`);
    expect(files).toContain('app/(app)/app/layout.tsx');
    expect(
      directActionImports(
        Object.fromEntries(
          files.map((file) => [file, readFileSync(file, 'utf8')]),
        ),
      ),
    ).toEqual([]);
  });
});
