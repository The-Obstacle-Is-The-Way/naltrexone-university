import { describe, expect, it, vi } from 'vitest';
import {
  claimRequestKeySlot,
  createRequestFingerprint,
  createRequestKeySlotStore,
  mintRequestKey,
  resolveRequestKey,
} from './idempotency-request-key';

describe('fingerprint-bound idempotency request keys', () => {
  it('reuses a preserved key only for the same request fingerprint', () => {
    const fingerprint = createRequestFingerprint(['question-1', 'choice-1']);
    const createIdempotencyKey = vi.fn(() => 'new-key');
    const setToken = vi.fn();

    const key = resolveRequestKey(
      { key: 'preserved-key', fingerprint },
      fingerprint,
      createIdempotencyKey,
      setToken,
    );

    expect(key).toBe('preserved-key');
    expect(createIdempotencyKey).not.toHaveBeenCalled();
    expect(setToken).not.toHaveBeenCalled();
  });

  it('mints and stores a fresh key when the request fingerprint changes', () => {
    const oldFingerprint = createRequestFingerprint(['question-1', 'choice-a']);
    const nextFingerprint = createRequestFingerprint([
      'question-1',
      'choice-b',
    ]);
    const setToken = vi.fn();

    const key = resolveRequestKey(
      { key: 'preserved-key', fingerprint: oldFingerprint },
      nextFingerprint,
      () => 'fresh-key',
      setToken,
    );

    expect(key).toBe('fresh-key');
    expect(setToken).toHaveBeenCalledWith({
      key: 'fresh-key',
      fingerprint: nextFingerprint,
    });
  });

  it('mints a replacement key bound to the current fingerprint', () => {
    const fingerprint = createRequestFingerprint(['question-1', 'choice-1']);
    const setToken = vi.fn();

    const key = mintRequestKey(() => 'replacement-key', fingerprint, setToken);

    expect(key).toBe('replacement-key');
    expect(setToken).toHaveBeenCalledWith({
      key: 'replacement-key',
      fingerprint,
    });
  });

  it('rejects token writes from a superseded owner generation', () => {
    const slots = createRequestKeySlotStore();
    const firstOwner = claimRequestKeySlot(slots, 'question-1');
    firstOwner.setToken({ key: 'first-key', fingerprint: 'first-request' });

    const secondOwner = claimRequestKeySlot(slots, 'question-1');
    secondOwner.setToken({ key: 'second-key', fingerprint: 'second-request' });
    firstOwner.setToken({ key: 'stale-key', fingerprint: 'first-request' });

    const nextOwner = claimRequestKeySlot(slots, 'question-1');
    expect(nextOwner.token).toEqual({
      key: 'second-key',
      fingerprint: 'second-request',
    });
  });

  it('allows every token transition made by the current owner generation', () => {
    const slots = createRequestKeySlotStore();
    const owner = claimRequestKeySlot(slots, 'question-1');

    owner.setToken({ key: 'initial-key', fingerprint: 'request' });
    owner.setToken({ key: 'retry-key', fingerprint: 'request' });
    owner.setToken({ key: 'retired-key', fingerprint: 'request' });

    const nextOwner = claimRequestKeySlot(slots, 'question-1');
    expect(nextOwner.token).toEqual({
      key: 'retired-key',
      fingerprint: 'request',
    });
  });
});
