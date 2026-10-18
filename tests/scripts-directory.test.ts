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

  it('confirms that every package script, workflow and Vercel build a row names runs its script', () => {
    expect(
      collectRunByIssues(readScriptsDirectory(), readScriptCallers()),
    ).toEqual([]);
  });
});

describe('the callers a row names', () => {
  const callers: ScriptCallers = {
    packageScripts: {
      'db:migrate': 'tsx scripts/db-migrate.ts',
      'test:e2e': 'tsx scripts/run-local-e2e.ts --project=chromium',
      build: 'next build',
    },
    readWorkflow: (name) =>
      ({
        'ci.yml': 'run: pnpm test:e2e\nrun: bash scripts/ci/start.sh',
        'other.yml': 'run: pnpm build',
      })[name] ?? null,
    vercelConfig: '{"buildCommand": "tsx scripts/check.ts && pnpm build"}',
  };

  function issuesFor(file: string, runBy: string): string[] {
    return collectRunByIssues([{ file, purpose: 'Does it.', runBy }], callers);
  }

  it('accepts a package script whose command runs the file', () => {
    expect(issuesFor('db-migrate.ts', '`pnpm db:migrate`')).toEqual([]);
  });

  it('reports a package script that package.json does not define', () => {
    expect(issuesFor('db-migrate.ts', '`pnpm db:migrat`')).toEqual([
      'db-migrate.ts names `pnpm db:migrat`, which package.json does not define.',
    ]);
  });

  it('reports a package script whose command runs another file', () => {
    expect(issuesFor('db-seed.ts', '`pnpm db:migrate`')).toEqual([
      'db-seed.ts names `pnpm db:migrate`, whose command does not run it.',
    ]);
  });

  it('accepts a workflow that runs the file directly or through a package script', () => {
    expect(issuesFor('ci/start.sh', '`ci.yml`')).toEqual([]);
    expect(issuesFor('run-local-e2e.ts', '`ci.yml`')).toEqual([]);
  });

  it('reports a workflow that does not exist', () => {
    expect(issuesFor('ci/start.sh', '`gone.yml`')).toEqual([
      'ci/start.sh names `gone.yml`, which is not a workflow.',
    ]);
  });

  it('reports a workflow that does not run the file', () => {
    expect(issuesFor('db-migrate.ts', '`other.yml`')).toEqual([
      'db-migrate.ts names `other.yml`, which does not run it.',
    ]);
  });

  it('reports a Vercel build that does not run the file', () => {
    expect(issuesFor('check.ts', 'The `vercel.json` build command')).toEqual(
      [],
    );
    expect(issuesFor('db-migrate.ts', 'The `vercel.json` build')).toEqual([
      'db-migrate.ts names `vercel.json`, whose build command does not run it.',
    ]);
  });
});
