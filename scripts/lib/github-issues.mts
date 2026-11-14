import type { Gh } from './github-cli.mts';

// GitHub emails about an issue that GitHub Actions opens only the repository's
// watchers and the issue's assignees, and the owner does not watch this
// repository (BUG-377). So a scheduled job assigns its issue to the owner that
// Actions names. A local run has no such owner, and assigns no one.
export function repositoryOwner(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  return env.GITHUB_REPOSITORY_OWNER || null;
}

// Only pagination transport is common. Each caller validates entries and owns
// author trust, lookup timing and the issue lifecycle.
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
