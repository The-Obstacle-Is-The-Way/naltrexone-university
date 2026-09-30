import { describe, expect, it, vi } from 'vitest';
import {
  clerkAnswer,
  clerkSdkErrorFor,
  droppedConnection,
} from './clerk-sdk-errors';

vi.mock('server-only', () => ({}));

describe('clerkSdkErrorFor', () => {
  it("returns the SDK's own error for a dropped connection and an error answer", async () => {
    await expect(clerkSdkErrorFor(droppedConnection)).resolves.toMatchObject({
      name: 'ClerkAPIResponseError',
      status: undefined,
      errors: [expect.objectContaining({ code: 'unexpected_error' })],
    });
    await expect(clerkSdkErrorFor(clerkAnswer(404))).resolves.toMatchObject({
      name: 'ClerkAPIResponseError',
      status: 404,
    });
  });

  it('fails loudly when the SDK does not throw', async () => {
    await expect(
      clerkSdkErrorFor(
        async () =>
          new Response(JSON.stringify({ object: 'user', id: 'user_1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    ).rejects.toThrow('Expected the Clerk SDK to throw');
  });
});
