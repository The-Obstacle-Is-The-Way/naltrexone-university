// CI's E2E step tests the running app, and holds the one shared Clerk test
// user while it does. A pull request that changes only files the app and its
// build never read gives it nothing new to test, so CI skips the step for
// one. A push to main always runs E2E: production's Deployment Check waits on
// that run, so every release has E2E on its exact commit. Whatever this
// script cannot prove documentation-only runs E2E.
//
// It prints `docs_only=true` or `docs_only=false` to $GITHUB_OUTPUT.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { isMain } from '../lib/entry-point.mts';

export type Git = (args: readonly string[]) => string;

export type E2eScope = {
  docsOnly: boolean;
  reason: string;
  paths: readonly string[];
};

/**
 * True for a path an E2E run never reads: no source it executes (the app,
 * its build and the E2E harness) names one, and app/globals.css keeps them
 * out of Tailwind's sources (both checked in e2e-scope.test.ts). Other Markdown at the root, such as
 * README.md, is a Tailwind source, so it is part of the app here.
 */
export function isOutsideTheApp(file: string): boolean {
  return (
    file.startsWith('docs/') || file === 'AGENTS.md' || file === 'CLAUDE.md'
  );
}

// A pull_request run checks out the pull request merged into its base, so
// the merge's first parent is the base the diff is taken against.
function baseOf(event: string, git: Git): string {
  if (event !== 'pull_request') {
    throw new Error(`a ${event || 'unnamed'} run always runs E2E`);
  }
  const [, firstParent, secondParent, extra] = git([
    'rev-list',
    '--parents',
    '-n',
    '1',
    'HEAD',
  ])
    .trim()
    .split(' ');
  if (!firstParent || !secondParent || extra) {
    throw new Error('the checked-out commit is not a two-parent merge');
  }
  return firstParent;
}

export function decideE2eScope(event: string, git: Git): E2eScope {
  try {
    const base = baseOf(event, git);
    // -z keeps unusual names unquoted, and --no-renames lists both sides of a
    // move, so a file moved from the app into docs/ still counts as the app.
    const paths = git([
      'diff',
      '--no-renames',
      '--name-only',
      '-z',
      base,
      'HEAD',
    ])
      .split('\0')
      .filter(Boolean);
    if (paths.length === 0) {
      return { docsOnly: false, reason: 'the diff changes no file', paths };
    }
    const app = paths.filter((file) => !isOutsideTheApp(file));
    return app.length === 0
      ? {
          docsOnly: true,
          reason: 'every changed file is outside the app',
          paths,
        }
      : {
          docsOnly: false,
          reason: `${app.length} changed file(s) are part of the app`,
          paths,
        };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { docsOnly: false, reason: `E2E runs: ${message}`, paths: [] };
  }
}

/* v8 ignore start -- the CI entry point; decideE2eScope carries the logic. */
if (isMain(import.meta.url)) {
  const git: Git = (args) =>
    execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const scope = decideE2eScope(process.env.GITHUB_EVENT_NAME ?? '', git);
  console.log(`docs_only=${scope.docsOnly}: ${scope.reason}`);
  for (const file of scope.paths) console.log(`  ${file}`);
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `docs_only=${scope.docsOnly}\n`);
}
/* v8 ignore stop */
