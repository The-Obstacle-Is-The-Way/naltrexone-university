import { readFile } from 'node:fs/promises';

export const E2E_CLERK_AUTH_STATE_PATH = 'test-results/.auth/e2e-user.json';

// BUG-330: the stored session's ID, which teardown revokes through Clerk's
// Backend API whatever a browser restoring the state can see.
export const E2E_CLERK_SESSION_ID_PATH = 'test-results/.auth/e2e-session-id';

// BUG-330: the first failed restore's error, which every later signed-in
// test fails with at once. Global setup and teardown remove it.
export const E2E_CLERK_RESTORE_FAILURE_PATH =
  'test-results/.auth/e2e-restore-failure';

type ReadIfPresent = (path: string) => Promise<string | null>;

export const readIfPresent: ReadIfPresent = (path) =>
  readFile(path, 'utf8').then(
    (text) => text.trim() || null,
    (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    },
  );

export async function withStoredClerkE2ESessionId<T>(
  run: (sessionId: string) => Promise<T>,
  read: ReadIfPresent = readIfPresent,
): Promise<T | undefined> {
  const sessionId = await read(E2E_CLERK_SESSION_ID_PATH);
  if (!sessionId) return undefined;
  return run(sessionId);
}

export type ClerkE2EAuthStateStore = {
  readSessionId(): Promise<string | null>;
  writeSessionId(sessionId: string): Promise<void>;
  writeState(): Promise<void>;
};

/**
 * BUG-330: saves the new session's ID, which teardown revokes it by, and then
 * the browser state that restores it, so no state is saved without its ID
 * (#1452 review).
 */
export async function saveClerkE2EAuthState(
  store: ClerkE2EAuthStateStore,
): Promise<void> {
  const sessionId = await store.readSessionId();
  if (!sessionId) {
    throw new Error('The new Clerk E2E session has no ID to store');
  }
  await store.writeSessionId(sessionId);
  await store.writeState();
}
