import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireAndForget } from './fire-and-forget';

describe('fireAndForget', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('does not throw when the onError handler throws', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const error = new Error('boom');
    const handlerError = new Error('handler boom');
    const onError = vi.fn(() => {
      throw handlerError;
    });

    fireAndForget(Promise.reject(error), onError);
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(error);
    expect(consoleError).toHaveBeenCalledWith(
      'onError handler threw',
      handlerError,
    );
  });
});
