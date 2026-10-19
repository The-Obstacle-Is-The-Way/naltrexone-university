import { describe, expect, it } from 'vitest';
import {
  collectRunByIssues,
  collectScriptsDirectoryIssues,
  isListedScript,
  parseScriptsDirectory,
  readScriptCallers,
  readScriptFiles,
  readScriptsDirectory,
  type ScriptCallers,
} from './scripts-directory-source-scan';

// ADR-023: a list kept in a document needs a test that checks it. The
// scripts README gives each script one row; a script added, moved or deleted
// without its row fails here.
describe('the scripts directory check', () => {
  it('reads every row between the markers, across family headings', () => {
    expect(
      parseScriptsDirectory(`
# Scripts

<!-- scripts-directory:start -->
## Database

| File | What it does | Run by |
| --- | --- | --- |
| \`db-migrate.ts\` | Applies migrations. | \`pnpm db:migrate\` |

## Seed

| File | What it does | Run by |
| --- | --- | --- |
| \`seed/file-reader.ts\` | Reads question files. | Imported by \`seed.ts\` |
<!-- scripts-directory:end -->
`),
    ).toEqual([
      {
        file: 'db-migrate.ts',
        purpose: 'Applies migrations.',
        runBy: '`pnpm db:migrate`',
      },
      {
        file: 'seed/file-reader.ts',
        purpose: 'Reads question files.',
        runBy: 'Imported by `seed.ts`',
      },
    ]);
  });

  it('fails closed when the markers are absent', () => {
    expect(() => parseScriptsDirectory('| `a.ts` | A. | B. |')).toThrow(
      /ordered start\/end marker pair/,
    );
  });

  it('fails closed when a marker pair is duplicated', () => {
    expect(() =>
      parseScriptsDirectory(`
<!-- scripts-directory:start -->
<!-- scripts-directory:end -->
<!-- scripts-directory:start -->
<!-- scripts-directory:end -->
`),
    ).toThrow(/exactly once/);
  });

  it('fails closed when a row has the wrong number of cells', () => {
    expect(() =>
      parseScriptsDirectory(`
<!-- scripts-directory:start -->
| File | What it does | Run by |
| --- | --- | --- |
| \`a.ts\` | A. |
<!-- scripts-directory:end -->
`),
    ).toThrow(/exactly three cells/);
  });

  it('fails closed when the end marker comes first', () => {
    expect(() =>
      parseScriptsDirectory(`
<!-- scripts-directory:end -->
<!-- scripts-directory:start -->
`),
    ).toThrow(/ordered start\/end marker pair/);
  });

  // GitHub renders a row without its closing pipe, so skipping it would let a
  // stale row pass and report a live one as missing.
  it('fails closed on a row without its closing pipe', () => {
    expect(() =>
      parseScriptsDirectory(`
<!-- scripts-directory:start -->
| \`a.ts\` | A. | B.
<!-- scripts-directory:end -->
`),
    ).toThrow(/must end with a pipe/);
  });

  it('keeps an escaped pipe inside a cell', () => {
    expect(
      parseScriptsDirectory(`
<!-- scripts-directory:start -->
| \`a.ts\` | Reads a \\| b. | CI |
<!-- scripts-directory:end -->
`),
    ).toEqual([{ file: 'a.ts', purpose: 'Reads a | b.', runBy: 'CI' }]);
  });

  it('fails closed on a row whose closing pipe is escaped', () => {
    expect(() =>
      parseScriptsDirectory(`
<!-- scripts-directory:start -->
| \`a.ts\` | A. | B. \\|
<!-- scripts-directory:end -->
`),
    ).toThrow(/must end with a pipe/);
  });

  // Both outer pipes are optional in GitHub's tables, so a row without its
  // leading pipe still renders.
  it('fails closed on a row without its leading pipe', () => {
    expect(() =>
      parseScriptsDirectory(`
<!-- scripts-directory:start -->
\`gone.ts\` | Gone. | Nobody |
<!-- scripts-directory:end -->
`),
    ).toThrow(/must start with a pipe/);
  });

  it('leaves tests, their helpers and fixtures to the naming conventions', () => {
    expect(
      [
        'seed.ts',
        'seed.test.ts',
        'merge-reviewed-pr-test-helpers.ts',
        'fixtures/lockfile-union/base.yaml',
        'ci/start-postgres.sh',
        'upstream-advisory-watch.mts',
        'README.md',
      ].filter(isListedScript),
    ).toEqual([
      'seed.ts',
      'ci/start-postgres.sh',
      'upstream-advisory-watch.mts',
    ]);
  });

  it('reports a script without a row and a row without a script', () => {
    expect(
      collectScriptsDirectoryIssues(
        ['a.ts'],
        [{ file: 'gone.ts', purpose: 'Gone.', runBy: 'Nobody' }],
      ),
    ).toEqual([
      'a.ts has no row in scripts/README.md.',
      'gone.ts is listed in scripts/README.md but is not a script there.',
    ]);
  });

  it('reports a row for a test, which the conventions cover instead', () => {
    expect(
      collectScriptsDirectoryIssues(
        ['a.ts'],
        [
          { file: 'a.ts', purpose: 'A.', runBy: 'CI' },
          { file: 'a.test.ts', purpose: 'Tests a.', runBy: 'Vitest' },
        ],
      ),
    ).toEqual([
      'a.test.ts is listed in scripts/README.md but is not a script there.',
    ]);
  });

  it('reports a script listed twice', () => {
    const row = { file: 'a.ts', purpose: 'A.', runBy: 'CI' };

    expect(collectScriptsDirectoryIssues(['a.ts'], [row, row])).toEqual([
      'a.ts appears 2 times in scripts/README.md.',
    ]);
  });

  it('reports a blank description or caller', () => {
    expect(
      collectScriptsDirectoryIssues(
        ['a.ts', 'b.ts'],
        [
          { file: 'a.ts', purpose: '', runBy: 'CI' },
          { file: 'b.ts', purpose: 'B.', runBy: '' },
        ],
      ),
    ).toEqual([
      'a.ts has no description in scripts/README.md.',
      'b.ts names no caller in scripts/README.md.',
    ]);
  });

  it('gives every script in the folder exactly one described row', () => {
    const files = readScriptFiles();

    expect(files.length).toBeGreaterThan(0);
    expect(
      collectScriptsDirectoryIssues(files, readScriptsDirectory()),
    ).toEqual([]);
  });

  it('checks static path references in each named package script, workflow and Vercel build', () => {
    expect(
      collectRunByIssues(readScriptsDirectory(), readScriptCallers()),
    ).toEqual([]);
  });
});

describe('the callers a row names', () => {
  function workflow(...runs: string[]): string {
    return `jobs:\n  test:\n    steps:\n${runs
      .map((run) => `      - run: ${JSON.stringify(run)}\n`)
      .join('')}`;
  }

  const callers: ScriptCallers = {
    packageScripts: {
      'db:migrate': 'tsx scripts/db-migrate.ts',
      'test:e2e': 'tsx scripts/run-local-e2e.ts --project=chromium',
      'test:e2e:hosted': 'tsx scripts/hosted.ts',
      build: 'next build && tsx scripts/manifest.ts',
    },
    readWorkflow: (name) =>
      ({
        'ci.yml': workflow('pnpm test:e2e', 'bash scripts/ci/start.sh'),
        'hosted.yml': workflow('pnpm test:e2e:hosted'),
        'other.yml': workflow('pnpm build'),
        'warn.yml': workflow(
          '# scripts/db-migrate.ts migrates\necho "Run scripts/db-migrate.ts by hand."',
        ),
      })[name] ?? null,
    vercelConfig: '{"buildCommand": "tsx scripts/check.ts && pnpm build"}',
  };

  function issuesFor(file: string, runBy: string): string[] {
    return collectRunByIssues([{ file, purpose: 'Does it.', runBy }], callers);
  }

  it('accepts a package script whose command runs the file', () => {
    expect(issuesFor('db-migrate.ts', '`pnpm db:migrate`')).toEqual([]);
  });

  it('reads a package script named with `pnpm run`', () => {
    expect(issuesFor('db-migrate.ts', '`pnpm run db:migrate`')).toEqual([]);
    expect(issuesFor('db-migrate.ts', '`pnpm run db:migrat`')).toEqual([
      'db-migrate.ts names `pnpm db:migrat`, which package.json does not define.',
    ]);
  });

  it('does not take a longer package script name for a shorter one', () => {
    expect(issuesFor('run-local-e2e.ts', '`hosted.yml`')).toEqual([
      'run-local-e2e.ts names `hosted.yml`, which does not reference it.',
    ]);
  });

  it('ignores a path a workflow only comments on or echoes', () => {
    expect(issuesFor('db-migrate.ts', '`warn.yml`')).toEqual([
      'db-migrate.ts names `warn.yml`, which does not reference it.',
    ]);
  });

  it('reports a package script that package.json does not define', () => {
    expect(issuesFor('db-migrate.ts', '`pnpm db:migrat`')).toEqual([
      'db-migrate.ts names `pnpm db:migrat`, which package.json does not define.',
    ]);
  });

  it('reports a package script whose command runs another file', () => {
    expect(issuesFor('db-seed.ts', '`pnpm db:migrate`')).toEqual([
      'db-seed.ts names `pnpm db:migrate`, whose command does not reference it.',
    ]);
  });

  it('accepts a workflow that runs the file directly or through a package script', () => {
    expect(issuesFor('ci/start.sh', '`ci.yml`')).toEqual([]);
    expect(issuesFor('run-local-e2e.ts', '`ci.yml`')).toEqual([]);
  });

  it('checks workflow names containing dots', () => {
    const entries = [
      { file: 'check.ts', purpose: 'Checks.', runBy: '`ci.old.yml`' },
    ];
    expect(
      collectRunByIssues(entries, { ...callers, readWorkflow: () => null }),
    ).toEqual(['check.ts names `ci.old.yml`, which is not a workflow.']);
    expect(
      collectRunByIssues(entries, {
        ...callers,
        readWorkflow: () => workflow('tsx scripts/check.ts'),
      }),
    ).toEqual([]);
  });

  it('checks package command names containing dots', () => {
    const entries = [
      { file: 'check.ts', purpose: 'Checks.', runBy: '`pnpm check.file`' },
    ];
    expect(
      collectRunByIssues(entries, { ...callers, packageScripts: {} }),
    ).toEqual([
      'check.ts names `pnpm check.file`, which package.json does not define.',
    ]);
    expect(
      collectRunByIssues(entries, {
        ...callers,
        packageScripts: { 'check.file': 'tsx scripts/check.ts' },
      }),
    ).toEqual([]);
  });

  it('reports a workflow that does not exist', () => {
    expect(issuesFor('ci/start.sh', '`gone.yml`')).toEqual([
      'ci/start.sh names `gone.yml`, which is not a workflow.',
    ]);
  });

  it('reports a workflow that does not run the file', () => {
    expect(issuesFor('db-migrate.ts', '`other.yml`')).toEqual([
      'db-migrate.ts names `other.yml`, which does not reference it.',
    ]);
  });

  it('reports a Vercel build that does not run the file', () => {
    expect(issuesFor('check.ts', 'The `vercel.json` build command')).toEqual(
      [],
    );
    expect(issuesFor('db-migrate.ts', 'The `vercel.json` build')).toEqual([
      'db-migrate.ts names `vercel.json`, whose build command does not reference it.',
    ]);
  });

  it('accepts a Vercel build that runs the file through a package script', () => {
    expect(issuesFor('manifest.ts', 'The `vercel.json` build')).toEqual([]);
  });

  it('does not count a script path in another Vercel field as a build reference', () => {
    expect(
      collectRunByIssues(
        [{ file: 'check.ts', purpose: 'Checks.', runBy: '`vercel.json`' }],
        {
          ...callers,
          vercelConfig: JSON.stringify({
            buildCommand: 'next build',
            ignoreCommand: 'tsx scripts/check.ts',
          }),
        },
      ),
    ).toEqual([
      'check.ts names `vercel.json`, whose build command does not reference it.',
    ]);
  });

  it('requires the whole script path, not the prefix of a different file', () => {
    expect(
      collectRunByIssues(
        [{ file: 'check.ts', purpose: 'Checks.', runBy: '`pnpm check`' }],
        {
          ...callers,
          packageScripts: { check: 'tsx scripts/check.ts.old' },
        },
      ),
    ).toEqual([
      'check.ts names `pnpm check`, whose command does not reference it.',
    ]);
  });

  it('ignores package commands that only echo or comment on a path', () => {
    expect(
      collectRunByIssues(
        [{ file: 'check.ts', purpose: 'Checks.', runBy: '`pnpm check`' }],
        {
          ...callers,
          packageScripts: {
            check: 'echo "scripts/check.ts"\n# scripts/check.ts',
          },
        },
      ),
    ).toEqual([
      'check.ts names `pnpm check`, whose command does not reference it.',
    ]);
  });

  it('follows nested package commands without looping on cycles', () => {
    const nestedCallers = {
      ...callers,
      packageScripts: {
        check: 'pnpm run inner',
        inner: 'pnpm cycle && tsx "scripts/check.ts"',
        cycle: 'pnpm check',
      },
    };
    expect(
      collectRunByIssues(
        [{ file: 'check.ts', purpose: 'Checks.', runBy: '`pnpm check`' }],
        nestedCallers,
      ),
    ).toEqual([]);
    expect(
      collectRunByIssues(
        [{ file: 'missing.ts', purpose: 'Checks.', runBy: '`pnpm check`' }],
        nestedCallers,
      ),
    ).toEqual([
      'missing.ts names `pnpm check`, whose command does not reference it.',
    ]);
  });
});
