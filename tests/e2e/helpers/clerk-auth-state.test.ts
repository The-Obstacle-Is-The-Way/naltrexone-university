import { describe, expect, it } from 'vitest';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  withClerkE2EAuthStateIfPresent,
} from './clerk-auth-state';

describe('withClerkE2EAuthStateIfPresent', () => {
  it('does not create an authenticated cleanup context when setup produced no state', async () => {
    let contextCreated = false;

    const result = await withClerkE2EAuthStateIfPresent(
      async () => {
        contextCreated = true;
        return 'created';
      },
      () => false,
    );

    expect(result).toBeUndefined();
    expect(contextCreated).toBe(false);
  });

  it('uses the shared state path when setup produced authentication state', async () => {
    let receivedPath: string | undefined;

    const result = await withClerkE2EAuthStateIfPresent(
      async (storageStatePath) => {
        receivedPath = storageStatePath;
        return 'created';
      },
      () => true,
    );

    expect(result).toBe('created');
    expect(receivedPath).toBe(E2E_CLERK_AUTH_STATE_PATH);
  });
});
