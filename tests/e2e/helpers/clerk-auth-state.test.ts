import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  E2E_CLERK_SESSION_ID_PATH,
  readIfPresent,
  withStoredClerkE2ESessionId,
} from './clerk-auth-state';

describe('withStoredClerkE2ESessionId', () => {
  it('does nothing when setup stored no session', async () => {
    let ran = false;

    const result = await withStoredClerkE2ESessionId(
      async () => {
        ran = true;
        return 'ran';
      },
      async () => null,
    );

    expect(result).toBeUndefined();
    expect(ran).toBe(false);
  });

  it('runs with the stored session ID, read from the shared path', async () => {
    const readPaths: string[] = [];

    const result = await withStoredClerkE2ESessionId(
      async (sessionId) => sessionId,
      async (path) => {
        readPaths.push(path);
        return 'sess_stored';
      },
    );

    expect(result).toBe('sess_stored');
    expect(readPaths).toEqual([E2E_CLERK_SESSION_ID_PATH]);
  });

  it('reads a missing file as nothing and a stored ID without its newline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bug-330-'));
    try {
      const path = join(directory, 'e2e-session-id');
      await expect(readIfPresent(path)).resolves.toBeNull();

      await writeFile(path, 'sess_on_disk\n');
      await expect(readIfPresent(path)).resolves.toBe('sess_on_disk');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
