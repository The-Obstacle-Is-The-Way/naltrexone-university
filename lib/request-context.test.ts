import { describe, expect, it, vi } from 'vitest';
import { createRequestContext, getRequestLogger } from './request-context';

vi.mock('server-only', () => ({}));

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createRequestContext', () => {
  it('generates a fresh UUID request id and no user id by default', () => {
    const first = createRequestContext();
    const second = createRequestContext();

    expect(first).toEqual({ requestId: expect.stringMatching(UUID_PATTERN) });
    expect(second.requestId).toMatch(UUID_PATTERN);
    expect(second.requestId).not.toBe(first.requestId);
  });

  it('keeps a supplied request id and user id', () => {
    const userId = crypto.randomUUID();

    expect(
      createRequestContext({ requestId: 'req-from-header', userId }),
    ).toEqual({ requestId: 'req-from-header', userId });
  });
});

describe('getRequestLogger', () => {
  it('binds the request id and user id to a child logger', () => {
    const userId = crypto.randomUUID();

    expect(
      getRequestLogger({ requestId: 'req-1', userId }).bindings(),
    ).toMatchObject({ requestId: 'req-1', userId });
  });

  it('omits the user id binding when the context has none', () => {
    expect(
      getRequestLogger({ requestId: 'req-2' }).bindings(),
    ).not.toHaveProperty('userId');
  });

  it('omits an empty user id binding that the context keeps', () => {
    const context = createRequestContext({ requestId: 'req-3', userId: '' });

    expect(context).toEqual({ requestId: 'req-3', userId: '' });
    expect(getRequestLogger(context).bindings()).not.toHaveProperty('userId');
  });
});
