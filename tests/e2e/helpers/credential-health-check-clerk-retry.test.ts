import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchClerkWithRetry } from './credential-health-check';

// What undici's fetch throws when the peer drops the connection.
function connectionReset() {
  return new TypeError('fetch failed', {
    cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
  });
}

// What undici's fetch throws when the peer closes the socket before the
// response headers arrive.
function socketClosed() {
  return new TypeError('fetch failed', {
    cause: Object.assign(new Error('other side closed'), {
      name: 'SocketError',
      code: 'UND_ERR_SOCKET',
    }),
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

  // #1257 review: undici's code for a socket closed before the headers.
  it('retries a socket closed before the response, then returns the answer', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(socketClosed())
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const response = await fetchClerkWithRetry(URL, {});

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
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

  // An unread body can hold undici's connection (#1256 review).
  it('cancels each superseded response body and keeps the last one readable', async () => {
    const cancelled: number[] = [];
    // Delivers its body only when read, so an unread body is still open and a
    // cancel reaches it.
    const answer = (attempt: number) =>
      new Response(
        new ReadableStream(
          {
            pull(controller) {
              controller.enqueue(new TextEncoder().encode(`answer ${attempt}`));
              controller.close();
            },
            cancel() {
              cancelled.push(attempt);
            },
          },
          { highWaterMark: 0 },
        ),
        { status: 503 },
      );
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(answer(1))
      .mockResolvedValueOnce(answer(2))
      .mockResolvedValueOnce(answer(3));

    const response = await fetchClerkWithRetry(URL, {});

    expect(cancelled).toEqual([1, 2]);
    await expect(response.text()).resolves.toBe('answer 3');
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
