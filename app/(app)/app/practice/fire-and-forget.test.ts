import { describe, expect, it, vi } from 'vitest';
import { fireAndForget } from './fire-and-forget';

describe('fireAndForget', () => {
  it('does not call onError when promise resolves', async () => {
    const onError = vi.fn();

    fireAndForget(Promise.resolve('ok'), onError);
    await Promise.resolve();

    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError when promise rejects', async () => {
    const onError = vi.fn();
    const error = new Error('boom');

    fireAndForget(Promise.reject(error), onError);
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(error);
  });
});
