import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchClerkWithRetry } from './credential-health-check';

// What undici's fetch throws when the peer drops the connection.
function connectionReset() {
  return new TypeError('fetch failed', {
    cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
  });
}

const URL = 'https://api.clerk.com/v1/users?limit=1';

afterEach(() => {
  vi.restoreAllMocks();
});

// BUG-312: the E2E helpers' Clerk calls retry what the app's own Clerk calls
// retry.
describe('fetchClerkWithRetry', () => {
  it('retries a dropped connection and a 503, then returns the answer', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(connectionReset())
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const response = await fetchClerkWithRetry(URL, { method: 'POST' });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'POST',
      'POST',
    ]);
  });

  it('returns the last transient response once its retries run out', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response('slow down', { status: 429 }),
      );

    const response = await fetchClerkWithRetry(URL, {});

    expect(response.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('throws the last dropped connection once its retries run out', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.reject(connectionReset()));

    await expect(fetchClerkWithRetry(URL, {})).rejects.toMatchObject({
      message: 'fetch failed',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['an auth rejection', 401],
    ['a validation answer', 422],
  ])('returns %s at once', async (_answer, status) => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('no', { status }));

    await expect(fetchClerkWithRetry(URL, {})).resolves.toMatchObject({
      status,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
