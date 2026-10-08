import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEPENDENCY_REPOSITORIES,
  directDependencySpecifiers,
  githubRepository,
  indirectRepositories,
  lockedVersions,
  lockfilePackages,
  registryRepository,
  watchedRepositories,
} from './upstream-advisory-watch';

// What the watch reads: package.json's dependencies, the packages in
// pnpm-lock.yaml, and the repository each one publishes advisories from.
describe('package.json specifiers', () => {
  it('reads runtime and development dependencies', () => {
    expect(
      directDependencySpecifiers(
        JSON.stringify({
          dependencies: { next: '16.3.6' },
          devDependencies: { vitest: '^4.1.11' },
        }),
      ),
    ).toEqual({ next: '16.3.6', vitest: '^4.1.11' });
  });

  it.each(['[]', '{"dependencies": []}', '{"dependencies": {"next": 16}}'])(
    'refuses a malformed manifest %s',
    (text) => {
      expect(() => directDependencySpecifiers(text)).toThrow(
        'Invalid package.json dependencies',
      );
    },
  );
});

const lockfile = [
  "lockfileVersion: '9.0'",
  '',
  'importers:',
  '',
  '  .:',
  '    dependencies:',
  '      next:',
  '        specifier: 16.3.6',
  '        version: 16.3.6(react@19.2.0)',
  '',
  'packages:',
  '',
  "  '@next/env@16.3.6':",
  '    resolution: {integrity: sha512-env}',
  '',
  '  next@16.3.6:',
  '    resolution: {integrity: sha512-next}',
  "    engines: {node: '>=20.9.0'}",
  '',
  '  undici@7.29.1:',
  '    resolution: {integrity: sha512-undici}',
  '',
  'snapshots:',
  '',
  '  next@16.3.6(react@19.2.0):',
  '    dependencies:',
  "      '@next/env': 16.3.6",
  '',
].join('\n');

describe('pnpm lockfile packages', () => {
  it('lists each resolved package once, from the packages section only', () => {
    expect(lockfilePackages(lockfile)).toEqual([
      { name: '@next/env', version: '16.3.6' },
      { name: 'next', version: '16.3.6' },
      { name: 'undici', version: '7.29.1' },
    ]);
  });

  it('groups the locked versions of each package', () => {
    expect(
      lockedVersions([
        { name: 'undici', version: '7.29.1' },
        { name: 'next', version: '16.3.6' },
        { name: 'undici', version: '6.21.0' },
      ]),
    ).toEqual(
      new Map([
        ['undici', ['6.21.0', '7.29.1']],
        ['next', ['16.3.6']],
      ]),
    );
  });

  it('reads this repository’s lockfile, which resolves every direct dependency', () => {
    const locked = lockedVersions(
      lockfilePackages(readFileSync('pnpm-lock.yaml', 'utf8')),
    );
    expect(
      Object.keys(
        directDependencySpecifiers(readFileSync('package.json', 'utf8')),
      ).filter((name) => !locked.has(name)),
    ).toEqual([]);
  });

  // A format change must fail the run, not shrink the watch silently.
  it.each([
    ['another lockfile format', lockfile.replace("'9.0'", "'10.0'")],
    ['no packages section', lockfile.replace('packages:', 'pkgs:')],
    ['an unrecognized key', lockfile.replace('  undici@7.29.1:', '  undici:')],
  ])('refuses %s', (_case, text) => {
    expect(() => lockfilePackages(text)).toThrow('Unsupported pnpm-lock.yaml');
  });
});

describe('GitHub repository named by an npm manifest', () => {
  it.each([
    ['git+https://github.com/nodejs/undici.git', 'nodejs/undici'],
    [
      {
        type: 'git',
        url: 'https://github.com/react/react.git',
        directory: 'packages/react',
      },
      'react/react',
    ],
    ['git://github.com/isaacs/minimatch.git', 'isaacs/minimatch'],
    ['git@github.com:lovell/sharp.git', 'lovell/sharp'],
    ['git+ssh://git@github.com/postcss/postcss.git', 'postcss/postcss'],
    ['https://github.com/fastify/fast-uri#readme', 'fastify/fast-uri'],
    ['https://www.github.com/babel/babel/tree/main/packages', 'babel/babel'],
    ['github:uhop/stream-json', 'uhop/stream-json'],
    ['ljharb/qs', 'ljharb/qs'],
    // Older GitHub accounts may end in a hyphen; color-convert's owner does.
    ['git+https://github.com/Qix-/color-convert.git', 'Qix-/color-convert'],
  ])('reads %j as %s', (field, repository) => {
    expect(githubRepository(field)).toBe(repository);
  });

  // The result becomes an API path, so anything but owner/name is refused.
  it.each([
    undefined,
    null,
    42,
    {},
    { url: 42 },
    'https://gitlab.com/owner/name',
    'gitlab:owner/name',
    'https://github.com/owner',
    'https://github.com/owner/../issues',
    'https://github.com/owner/..',
    'https://example.com/github.com/owner/name',
    'github:owner/name/extra',
    'owner/name?state=all',
  ])('finds no GitHub repository in %j', (field) => {
    expect(githubRepository(field)).toBeNull();
  });
});

describe('npm registry manifest', () => {
  it('reads the repository field of the exact locked version', async () => {
    const urls: string[] = [];
    const repository = await registryRepository(
      '@next/env',
      '16.3.6',
      async (url) => {
        urls.push(String(url));
        return Response.json({
          name: '@next/env',
          repository: { type: 'git', url: 'https://github.com/vercel/next.js' },
        });
      },
    );
    expect(urls).toEqual(['https://registry.npmjs.org/@next%2Fenv/16.3.6']);
    expect(repository).toEqual({
      type: 'git',
      url: 'https://github.com/vercel/next.js',
    });
  });

  it.each([
    ['an error status', new Response('{}', { status: 503 })],
    ['a non-object manifest', Response.json([])],
  ])('fails on %s', async (_case, response) => {
    await expect(
      registryRepository('undici', '7.29.1', async () => response),
    ).rejects.toThrow();
  });
});

describe('repositories reached through indirect dependencies', () => {
  const reader =
    (fields: Record<string, unknown>) =>
    async (name: string, version: string) => {
      const field = fields[`${name}@${version}`];
      if (field instanceof Error) throw field;
      return field;
    };

  it('groups packages by repository, leaving out the ones already watched', async () => {
    expect(
      await indirectRepositories(
        [
          { name: 'undici', version: '7.29.1' },
          { name: 'undici', version: '6.21.0' },
          { name: '@next/env', version: '16.3.6' },
          { name: 'eyes', version: '0.1.8' },
          { name: 'fast-uri', version: '3.1.8' },
          { name: 'shell-quote', version: '1.8.3' },
        ],
        ['vercel/next.js'],
        reader({
          'undici@7.29.1': 'git+https://github.com/nodejs/undici.git',
          'undici@6.21.0': 'https://github.com/Nodejs/undici',
          '@next/env@16.3.6': { url: 'https://github.com/Vercel/next.js' },
          'eyes@0.1.8': undefined,
          'fast-uri@3.1.8': new Error('registry unavailable'),
          'shell-quote@1.8.3': 'https://github.com/ljharb/shell-quote',
        }),
      ),
    ).toEqual({
      repositories: ['ljharb/shell-quote', 'nodejs/undici'],
      unwatched: ['eyes@0.1.8'],
      unreadable: ['fast-uri@3.1.8'],
    });
  });

  it('reads a bounded number of manifests at a time', async () => {
    let inFlight = 0;
    let most = 0;
    await indirectRepositories(
      Array.from({ length: 20 }, (_, index) => ({
        name: `package-${index}`,
        version: '1.0.0',
      })),
      [],
      async () => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return 'owner/name';
      },
      4,
    );
    expect(most).toBe(4);
  });
});

describe('watched repositories', () => {
  // A dependency added without a watch decision fails here, not silently.
  it('maps every direct dependency in package.json, and nothing else', () => {
    const manifest = directDependencySpecifiers(
      readFileSync('package.json', 'utf8'),
    );
    expect(Object.keys(DEPENDENCY_REPOSITORIES).sort()).toEqual(
      Object.keys(manifest).sort(),
    );
  });

  it('names a GitHub owner and repository for each mapped dependency', () => {
    for (const repository of Object.values(DEPENDENCY_REPOSITORIES)) {
      if (repository !== null)
        expect(repository).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
    }
  });

  it('leaves unwatched only the dependencies that publish no repository', () => {
    expect(
      Object.entries(DEPENDENCY_REPOSITORIES)
        .filter(([, repository]) => repository === null)
        .map(([name]) => name),
    ).toEqual(['server-only']);
  });

  it('watches each repository once, including the ones whose advisories Dependabot missed', () => {
    const repositories = watchedRepositories();
    expect(new Set(repositories).size).toBe(repositories.length);
    expect(repositories).toEqual([...repositories].sort());
    expect(repositories).toEqual(
      expect.arrayContaining([
        'vercel/next.js',
        'getsentry/sentry-javascript',
        'vitejs/vite',
        'clerk/javascript',
      ]),
    );
  });
});
