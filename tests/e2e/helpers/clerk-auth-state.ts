import { readFile } from 'node:fs/promises';

export const E2E_CLERK_AUTH_STATE_PATH = 'test-results/.auth/e2e-user.json';

// BUG-330: the stored session's ID, which teardown revokes through Clerk's
// Backend API whatever a browser restoring the state can see.
export const E2E_CLERK_SESSION_ID_PATH = 'test-results/.auth/e2e-session-id';

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
