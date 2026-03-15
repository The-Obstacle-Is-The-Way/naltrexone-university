import { afterEach, describe, expect, it, vi } from 'vitest';

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

import {
  reportClientError,
  shouldReportClientError,
} from './report-client-error';

describe('reportClientError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    captureExceptionMock.mockReset();
  });

  it('calls Sentry.captureException with the error and context tags', () => {
    const error = new Error('boom');

    reportClientError(error, {
      component: 'PracticePage',
      action: 'startSession',
    });

    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      tags: {
        component: 'PracticePage',
        action: 'startSession',
      },
    });
  });

  it('calls console.error with a client prefix in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const error = new Error('boom');

    reportClientError(error, {
      component: 'PracticePage',
      action: 'toggleBookmark',
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ClientError]',
      {
        component: 'PracticePage',
        action: 'toggleBookmark',
      },
      error,
    );
  });

  it('still captures when error is not an Error instance', () => {
    const error = { message: 'boom' };

    expect(() =>
      reportClientError(error, {
        component: 'PracticePage',
        action: 'loadQuestion',
      }),
    ).not.toThrow();

    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      tags: {
        component: 'PracticePage',
        action: 'loadQuestion',
      },
    });
  });

  it('captures with no tags when context is omitted', () => {
    const error = new Error('boom');

    reportClientError(error);

    expect(captureExceptionMock).toHaveBeenCalledWith(error);
  });

  it('does not call console.error in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    reportClientError(new Error('boom'), {
      component: 'PracticePage',
      action: 'startSession',
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalled();
  });

  it('does not throw when Sentry.captureException throws', () => {
    captureExceptionMock.mockImplementation(() => {
      throw new Error('Sentry failed');
    });

    expect(() =>
      reportClientError(new Error('boom'), {
        component: 'PracticePage',
        action: 'startSession',
      }),
    ).not.toThrow();
  });

  it('does not throw when console.error throws in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('Console failed');
    });

    expect(() =>
      reportClientError(new Error('boom'), {
        component: 'PracticePage',
        action: 'startSession',
      }),
    ).not.toThrow();
  });
});

describe('shouldReportClientError', () => {
  it('returns false for expected business action-result errors', () => {
    expect(
      shouldReportClientError({
        code: 'UNSUBSCRIBED',
        message: 'Subscription required',
      }),
    ).toBe(false);
  });

  it('returns true for unexpected action-result errors', () => {
    expect(
      shouldReportClientError({
        code: 'INTERNAL_ERROR',
        message: 'Internal error',
      }),
    ).toBe(true);
  });
});
