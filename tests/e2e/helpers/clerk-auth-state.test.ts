import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  E2E_CLERK_SESSION_ID_PATH,
  readIfPresent,
  saveClerkE2EAuthState,
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

// #1452 review: the stored state is only worth saving with the session ID
// teardown revokes it by, so the ID goes first.
describe('saveClerkE2EAuthState', () => {
  class RecordingAuthStateStore {
    readonly saved: string[] = [];
    constructor(private readonly sessionId: string | null) {}
    async readSessionId() {
      return this.sessionId;
    }
    async writeSessionId(sessionId: string) {
      this.saved.push(`session ID ${sessionId}`);
    }
    async writeState() {
      this.saved.push('state');
    }
  }

  it('stores the session ID before the state', async () => {
    const store = new RecordingAuthStateStore('sess_2abcDEF345');

    await saveClerkE2EAuthState(store);

    expect(store.saved).toEqual(['session ID sess_2abcDEF345', 'state']);
  });

  it('saves nothing when the new session has no ID', async () => {
    const store = new RecordingAuthStateStore(null);

    await expect(saveClerkE2EAuthState(store)).rejects.toThrow(
      'The new Clerk E2E session has no ID to store',
    );
    expect(store.saved).toEqual([]);
  });
});
