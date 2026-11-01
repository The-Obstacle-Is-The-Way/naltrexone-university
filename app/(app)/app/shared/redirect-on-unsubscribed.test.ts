import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { redirectOnUnsubscribed } from './redirect-on-unsubscribed';

describe('redirectOnUnsubscribed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces the page with Pricing by default, as a server redirect does', async () => {
    const replace = vi.fn();
    vi.stubGlobal('window', { location: { replace } });
    const action = redirectOnUnsubscribed(async () => ({
      ok: false,
      error: { code: 'UNSUBSCRIBED', message: 'Subscription required' },
    }));

    await action({});

    expect(replace).toHaveBeenCalledWith(
      '/pricing?reason=subscription_required',
    );
  });

  it('starts a full navigation to Pricing when the action finds no subscription, and still returns the result', async () => {
    const navigate = vi.fn();
    const refused: ActionResult<number> = {
      ok: false,
      error: { code: 'UNSUBSCRIBED', message: 'Subscription required' },
    };
    const action = redirectOnUnsubscribed(async () => refused, navigate);

    await expect(action({ any: 'input' })).resolves.toBe(refused);
    expect(navigate).toHaveBeenCalledWith(
      '/pricing?reason=subscription_required',
    );
  });

  it.each([
    { ok: true, data: 1 },
    { ok: false, error: { code: 'CONFLICT', message: 'Busy' } },
  ] satisfies ActionResult<number>[])(
    'stays on the page for any other result: %j',
    async (result) => {
      const navigate = vi.fn();
      const action = redirectOnUnsubscribed(async () => result, navigate);

      await expect(action({})).resolves.toBe(result);
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it('passes the input through to the action', async () => {
    const calls: unknown[] = [];
    const action = redirectOnUnsubscribed(async (input: unknown) => {
      calls.push(input);
      return { ok: true, data: null };
    }, vi.fn());

    await action({ sessionId: 'abc' });
    expect(calls).toEqual([{ sessionId: 'abc' }]);
  });
});
