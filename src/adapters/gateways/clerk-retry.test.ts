import { describe, expect, it, vi } from 'vitest';
import { isTransientClerkError } from './clerk-retry';
import {
  clerkAnswer,
  clerkSdkErrorFor,
  droppedConnection,
} from './test-helpers/clerk-sdk-errors';

vi.mock('server-only', () => ({}));

// BUG-313: what the Clerk SDK throws, obtained from the real SDK.
describe('isTransientClerkError', () => {
  it('recognizes a dropped connection, which the SDK reports with no status', async () => {
    const error = await clerkSdkErrorFor(droppedConnection);

    expect(error).toMatchObject({ status: undefined });
    expect(isTransientClerkError(error)).toBe(true);
  });

  it.each([429, 500, 503])('recognizes a %i answer', async (status) => {
    expect(
      isTransientClerkError(await clerkSdkErrorFor(clerkAnswer(status))),
    ).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])(
    'does not retry a %i answer',
    async (status) => {
      expect(
        isTransientClerkError(await clerkSdkErrorFor(clerkAnswer(status))),
      ).toBe(false);
    },
  );

  it('does not retry an unrelated error', () => {
    expect(isTransientClerkError(new Error('boom'))).toBe(false);
    expect(isTransientClerkError(null)).toBe(false);
  });
});
