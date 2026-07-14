import { describe, expect, it, vi } from 'vitest';
import {
  createRequestFingerprint,
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
});
