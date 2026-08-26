import { existsSync } from 'node:fs';

export const E2E_CLERK_AUTH_STATE_PATH = 'test-results/.auth/e2e-user.json';

type AuthStateExists = (path: string) => boolean;

export async function withClerkE2EAuthStateIfPresent<T>(
  runWithAuthState: (storageStatePath: string) => Promise<T>,
  authStateExists: AuthStateExists = existsSync,
): Promise<T | undefined> {
  if (!authStateExists(E2E_CLERK_AUTH_STATE_PATH)) return undefined;
  return runWithAuthState(E2E_CLERK_AUTH_STATE_PATH);
}
