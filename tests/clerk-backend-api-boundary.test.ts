import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  findClerkBackendApiUses,
  NOT_PRODUCTION,
  PRODUCTION_SOURCE,
} from './clerk-backend-api-boundary-source-scan';

function productionFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(
      (path) => PRODUCTION_SOURCE.test(path) && !NOT_PRODUCTION.test(path),
    )
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }));
}

describe("Clerk's Backend API boundary", () => {
  it.each([
    ['a static import', "import { currentUser } from '@clerk/nextjs/server';"],
    [
      'a dynamic import',
      "const { currentUser } = await import('@clerk/nextjs/server');",
    ],
    [
      'a namespace import',
      "import * as clerk from '@clerk/nextjs/server';\nclerk.currentUser();",
    ],
    [
      'a client built from the package',
      "import { createClerkClient } from '@clerk/nextjs/server';",
    ],
    [
      'the backend client',
      "import { clerkClient } from '@clerk/nextjs/server';",
    ],
  ])('flags %s outside the composition root', (_case, text) => {
    expect(
      findClerkBackendApiUses([{ path: 'app/page.tsx', text }]),
    ).not.toEqual([]);
  });

  it.each([
    "import { verifyToken } from '@clerk/backend';",
    "const backend = await import('@clerk/backend/internal');",
    "const backend = require('@clerk/backend');",
  ])('flags the backend package: %s', (text) => {
    expect(findClerkBackendApiUses([{ path: 'lib/clerk.ts', text }])).toEqual([
      { path: 'lib/clerk.ts', use: '@clerk/backend' },
    ]);
  });

  // A session token minted from a template, or with a custom lifetime, is a
  // Backend API call on every request that asks for it.
  it('flags getToken() called with options, but not without', () => {
    expect(
      findClerkBackendApiUses([
        {
          path: 'app/page.tsx',
          text: "const token = await (await auth()).getToken({ template: 'x' });",
        },
        { path: 'app/other.tsx', text: 'const token = await getToken();' },
      ]),
    ).toEqual([{ path: 'app/page.tsx', use: 'getToken with options' }]);
  });

  it('treats JavaScript and JSX files as production source', () => {
    expect(
      ['components/x.jsx', 'lib/x.mjs', 'app/x.tsx'].every((path) =>
        PRODUCTION_SOURCE.test(path),
      ),
    ).toBe(true);
  });

  it('flags a barrel that re-exports a Clerk package', () => {
    expect(
      findClerkBackendApiUses([
        { path: 'lib/clerk.ts', text: "export * from '@clerk/nextjs/server';" },
      ]),
    ).toEqual([{ path: 'lib/clerk.ts', use: 'export * from @clerk' }]);
  });

  it('allows only the backend client at the composition root', () => {
    expect(
      findClerkBackendApiUses([
        {
          path: 'lib/container.ts',
          text: "const { clerkClient, currentUser } = await import('@clerk/nextjs/server');",
        },
      ]),
    ).toEqual([{ path: 'lib/container.ts', use: 'currentUser' }]);
  });

  it('allows auth() and a comment that names the backend package', () => {
    expect(
      findClerkBackendApiUses([
        {
          path: 'src/adapters/gateways/clerk-retry.ts',
          text: "// @clerk/backend catches a failed fetch\nimport { auth } from '@clerk/nextjs/server';",
        },
      ]),
    ).toEqual([]);
  });

  it('scans every production file, the root files included', () => {
    const paths = productionFiles().map(({ path }) => path);

    expect(paths).toEqual(
      expect.arrayContaining([
        'lib/container.ts',
        'proxy.ts',
        'instrumentation.ts',
      ]),
    );
    expect(paths.some((path) => NOT_PRODUCTION.test(path))).toBe(false);
  });

  it('finds no Backend API use outside the composition root', () => {
    expect(findClerkBackendApiUses(productionFiles())).toEqual([]);
  });
});
