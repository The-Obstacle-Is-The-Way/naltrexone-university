import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('check-file-size.sh', () => {
  it('excludes oversized non-production support files explicitly', () => {
    const supportFiles = [
      'app/(app)/app/practice/[sessionId]/hooks/practice-session-page-model.browser.probes.tsx',
      'src/application/test-helpers/fakes/fake-attempt-repository.ts',
    ];

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
