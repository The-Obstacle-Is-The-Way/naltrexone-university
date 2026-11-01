import { beforeAll, describe, expect, it } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';

let redirectIfUnsubscribed: typeof import('./redirect-if-unsubscribed').redirectIfUnsubscribed;

beforeAll(async () => {
  ({ redirectIfUnsubscribed } = await import('./redirect-if-unsubscribed'));
});

const unsubscribed: ActionResult<never> = {
  ok: false,
  error: { code: 'UNSUBSCRIBED', message: 'Subscription required' },
};

describe('redirectIfUnsubscribed', () => {
  it('sends a learner whose data check found no subscription to Pricing', () => {
    expect(() =>
      redirectIfUnsubscribed([{ ok: true, data: 1 }, unsubscribed]),
    ).toThrow(
      expect.objectContaining({
        digest: expect.stringContaining(
          ';/pricing?reason=subscription_required;',
        ),
      }),
    );
  });

  it('leaves successful results and other failures to the page', () => {
    expect(() =>
      redirectIfUnsubscribed([
        { ok: true, data: 1 },
        { ok: false, error: { code: 'NOT_FOUND', message: 'Missing' } },
      ]),
    ).not.toThrow();
  });
});
