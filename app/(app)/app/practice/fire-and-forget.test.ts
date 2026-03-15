import { afterEach, describe, expect, it, vi } from 'vitest';

const { reportClientErrorMock } = vi.hoisted(() => ({
  reportClientErrorMock: vi.fn(),
}));

vi.mock('@/lib/report-client-error', () => ({
  reportClientError: reportClientErrorMock,
}));

import { fireAndForget, logUnhandledAsyncError } from './fire-and-forget';

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

  it('reports unhandled async errors via reportClientError', () => {
    const error = new Error('boom');

    logUnhandledAsyncError(error);

    expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
      component: 'FireAndForget',
      action: 'unhandledAsyncAction',
    });
  });

  it('does not throw when the onError handler throws', async () => {
    const error = new Error('boom');
    const handlerError = new Error('handler boom');
    const onError = vi.fn(() => {
      throw handlerError;
    });

    fireAndForget(Promise.reject(error), onError);
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(error);
    expect(reportClientErrorMock).toHaveBeenCalledWith(handlerError, {
      component: 'FireAndForget',
      action: 'onErrorHandler',
    });
  });
});
