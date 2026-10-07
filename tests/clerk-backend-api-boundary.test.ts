import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// DEBT-503 item 1: Clerk's Backend API is a shared, rate-limited allowance,
// and signed-in requests read the session through auth() instead. Only the
// composition root may reach the Backend API client, and no code may fetch
// the whole user per request with currentUser().

const SOURCE_ROOTS = ['app', 'src', 'lib', 'components', 'proxy.ts'];
const TEST_FILE = /(\.test\.|\.spec\.|test-helpers|\.fixtures\.|\.probes\.)/;

function productionFilesImportingClerkServer(): string[] {
  const files = execFileSync('git', ['ls-files', ...SOURCE_ROOTS], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter((file) => /\.(ts|tsx)$/.test(file) && !TEST_FILE.test(file));
  return files.filter((file) =>
    readFileSync(file, 'utf8').includes('@clerk/nextjs/server'),
  );
}

describe("Clerk's Backend API boundary", () => {
  const files = productionFilesImportingClerkServer();

  it('finds the composition root, so the scan reads real files', () => {
    expect(files).toContain('lib/container.ts');
  });

  it('never calls currentUser()', () => {
    expect(
      files.filter((file) =>
        /\bcurrentUser\b/.test(readFileSync(file, 'utf8')),
      ),
    ).toEqual([]);
  });

  it('reaches the Backend API client only from the composition root', () => {
    expect(
      files.filter((file) =>
        /\bclerkClient\b/.test(readFileSync(file, 'utf8')),
      ),
    ).toEqual(['lib/container.ts']);
  });
});
