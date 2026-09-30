import { vi } from 'vitest';

// The error @clerk/backend itself throws for a request whose fetch has the
// given outcome, obtained by calling the real SDK over a stubbed fetch. A
// caller's test file mocks `server-only`, which `@clerk/nextjs/server` loads.
export async function clerkSdkErrorFor(
  fetchOutcome: () => Promise<Response>,
): Promise<unknown> {
  const { createClerkClient } = await import('@clerk/nextjs/server');
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(fetchOutcome);
  try {
    await createClerkClient({ secretKey: 'sk_test' }).users.getUser(
      'user_sdk_error',
    );
  } catch (error) {
    return error;
  } finally {
    fetchSpy.mockRestore();
  }
  throw new Error('Expected the Clerk SDK to throw');
}

// What undici's fetch throws when the peer drops the connection.
export function droppedConnection(): Promise<Response> {
  return Promise.reject(
    new TypeError('fetch failed', {
      cause: Object.assign(new Error('read ECONNRESET'), {
        code: 'ECONNRESET',
      }),
    }),
  );
}

// A Clerk API error answer with the given status.
export function clerkAnswer(status: number): () => Promise<Response> {
  return async () =>
    new Response(
      JSON.stringify({ errors: [{ code: 'error', message: 'error' }] }),
      { status, headers: { 'content-type': 'application/json' } },
    );
}
