import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MAX_ALLOWED_FILE_LINES = 350;

function countNewlineTerminatedLines(contents: string): number {
  if (contents.length === 0) {
    return 0;
  }

  return contents.split('\n').length - (contents.endsWith('\n') ? 1 : 0);
}

describe('check-file-size.sh', () => {
  it('excludes oversized non-production support files explicitly', () => {
    const supportFiles = [
      {
        filePath:
          'app/(app)/app/practice/[sessionId]/hooks/practice-session-page-model.browser.probes.tsx',
        matchesShellExemption: (filePath: string) =>
          filePath.endsWith('.browser.probes.tsx'),
        shellExemptionPattern: '*.browser.probes.tsx',
      },
      {
        filePath:
          'src/application/test-helpers/fakes/fake-attempt-repository.ts',
        matchesShellExemption: (filePath: string) =>
          filePath.startsWith('src/application/test-helpers/'),
        shellExemptionPattern: 'src/application/test-helpers/*',
      },
    ];
    const supportFilePaths = supportFiles.map(({ filePath }) => filePath);

    for (const {
      filePath,
      matchesShellExemption,
      shellExemptionPattern,
    } of supportFiles) {
      expect(
        matchesShellExemption(filePath),
        `${filePath} must exercise ${shellExemptionPattern}`,
      ).toBe(true);
      const lineCount = countNewlineTerminatedLines(
        readFileSync(filePath, 'utf8'),
      );
      expect(lineCount).toBeGreaterThan(MAX_ALLOWED_FILE_LINES);
    }

    const result = spawnSync(
      'sh',
      ['scripts/check-file-size.sh', ...supportFilePaths],
      {
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });
});
