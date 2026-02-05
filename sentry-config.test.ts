// @vitest-environment jsdom
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
    it('returns no initialization when NEXT_PUBLIC_SENTRY_DSN is unset', async () => {
      // Arrange
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      // Act
      await import('./sentry.client.config');

      // Assert
      expect(initMock).not.toHaveBeenCalled();
    });

    it('returns initialized client with safe defaults when NEXT_PUBLIC_SENTRY_DSN is set', async () => {
      // Arrange
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://examplePublicDsn';

      // Act
      await import('./sentry.client.config');

      // Assert
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
    it('returns initialized browser SDK when NEXT_PUBLIC_SENTRY_DSN is set', async () => {
      // Arrange
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://examplePublicDsn';

      // Act
      await import('./instrumentation-client');

      // Assert
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
    it('returns no initialization when DSNs are unset', async () => {
      // Arrange
      delete process.env.SENTRY_DSN;
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      // Act
      const instrumentation = await import('./instrumentation');
      await instrumentation.register();

      // Assert
      expect(initMock).not.toHaveBeenCalled();
    });

    it('returns initialized client using SENTRY_DSN when set', async () => {
      // Arrange
      process.env.SENTRY_DSN = 'https://exampleServerDsn';

      // Act
      const instrumentation = await import('./instrumentation');
      await instrumentation.register();

      // Assert
      expect(initMock).toHaveBeenCalledWith({
        dsn: 'https://exampleServerDsn',
        tracesSampleRate: 0,
        environment: process.env.NODE_ENV,
      });
    });

    it('returns initialized client using NEXT_PUBLIC_SENTRY_DSN when SENTRY_DSN is unset', async () => {
      // Arrange
      delete process.env.SENTRY_DSN;
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://examplePublicDsn';

      // Act
      const instrumentation = await import('./instrumentation');
      await instrumentation.register();

      // Assert
      expect(initMock).toHaveBeenCalledWith({
        dsn: 'https://examplePublicDsn',
        tracesSampleRate: 0,
        environment: process.env.NODE_ENV,
      });
    });

    it('returns onRequestError as captureRequestError', async () => {
      // Arrange
      // (mocks are defined at module scope)

      // Act
      const instrumentation = await import('./instrumentation');

      // Assert
      expect(instrumentation.onRequestError).toBe(captureRequestErrorMock);
    });
  });
});
