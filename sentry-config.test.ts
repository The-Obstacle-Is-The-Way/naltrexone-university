import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initMock = vi.fn();
const captureRequestErrorMock = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  init: initMock,
  captureRequestError: captureRequestErrorMock,
}));

describe('Sentry configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    initMock.mockClear();
    captureRequestErrorMock.mockClear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe('sentry.client.config', () => {
    it('does not initialize when NEXT_PUBLIC_SENTRY_DSN is unset', async () => {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
      await import('./sentry.client.config');
      expect(initMock).not.toHaveBeenCalled();
    });

    it('initializes with safe defaults when NEXT_PUBLIC_SENTRY_DSN is set', async () => {
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://examplePublicDsn';
      await import('./sentry.client.config');

      expect(initMock).toHaveBeenCalledWith({
        dsn: 'https://examplePublicDsn',
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        environment: process.env.NODE_ENV,
      });
    });
  });

  describe('instrumentation-client', () => {
    it('initializes the browser SDK when NEXT_PUBLIC_SENTRY_DSN is set', async () => {
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://examplePublicDsn';
      await import('./instrumentation-client');

      expect(initMock).toHaveBeenCalledWith({
        dsn: 'https://examplePublicDsn',
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        environment: process.env.NODE_ENV,
      });
    });
  });

  describe('instrumentation', () => {
    it('does not initialize when DSNs are unset', async () => {
      delete process.env.SENTRY_DSN;
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      const instrumentation = await import('./instrumentation');
      await instrumentation.register();

      expect(initMock).not.toHaveBeenCalled();
    });

    it('initializes using SENTRY_DSN when set', async () => {
      process.env.SENTRY_DSN = 'https://exampleServerDsn';

      const instrumentation = await import('./instrumentation');
      await instrumentation.register();

      expect(initMock).toHaveBeenCalledWith({
        dsn: 'https://exampleServerDsn',
        tracesSampleRate: 0,
        environment: process.env.NODE_ENV,
      });
    });

    it('falls back to NEXT_PUBLIC_SENTRY_DSN when SENTRY_DSN is unset', async () => {
      delete process.env.SENTRY_DSN;
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://examplePublicDsn';

      const instrumentation = await import('./instrumentation');
      await instrumentation.register();

      expect(initMock).toHaveBeenCalledWith({
        dsn: 'https://examplePublicDsn',
        tracesSampleRate: 0,
        environment: process.env.NODE_ENV,
      });
    });

    it('exports onRequestError as captureRequestError', async () => {
      const instrumentation = await import('./instrumentation');
      expect(instrumentation.onRequestError).toBe(captureRequestErrorMock);
    });
  });
});
