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
      'app/(app)/app/practice/[sessionId]/hooks/practice-session-page-model.browser.probes.tsx',
      'src/application/test-helpers/fakes/fake-attempt-repository.ts',
    ];

    for (const supportFile of supportFiles) {
      const lineCount = countNewlineTerminatedLines(
        readFileSync(supportFile, 'utf8'),
      );
      expect(lineCount).toBeGreaterThan(MAX_ALLOWED_FILE_LINES);
    }

    const result = spawnSync(
      'sh',
      ['scripts/check-file-size.sh', ...supportFiles],
      {
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });
});
