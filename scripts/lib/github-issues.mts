import type { Gh } from './github-cli.mts';

// Only pagination transport is common. Each caller validates entries and owns
// author trust, assignment, lookup timing and the issue lifecycle.
export function listRepositoryIssueEntries(run: Gh): unknown[] {
  const pages: unknown = JSON.parse(
    run([
      'api',
      '--paginate',
      '--slurp',
      'repos/{owner}/{repo}/issues?state=all&per_page=100',
    ]),
  );
  if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
    throw new Error('Invalid GitHub issue response');
  }
  return pages.flat();
}
