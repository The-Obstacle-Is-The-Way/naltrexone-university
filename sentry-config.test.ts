// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initMock = vi.fn();
const captureRequestErrorMock = vi.fn();
const SENTRY_DISABLED_IN_PRODUCTION_WARNING =
  '[SENTRY_DISABLED] Sentry DSN is not configured; server telemetry is disabled.';

vi.mock('@sentry/nextjs', () => ({
  init: initMock,
  captureRequestError: captureRequestErrorMock,
}));

describe('Sentry configuration', () => {
  const originalEnv = { ...process.env };

  const getClientEnvironment = () =>
    process.env.NEXT_PUBLIC_VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim();

  const getServerEnvironment = () =>
    process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim();

  beforeEach(() => {
    initMock.mockClear();
    captureRequestErrorMock.mockClear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
    vi.restoreAllMocks();
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
        environment: getClientEnvironment(),
      });
    });

    it('uses NEXT_PUBLIC_VERCEL_ENV when provided', async () => {
      // Arrange
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://examplePublicDsn';
      process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview';

      // Act
      await import('./sentry.client.config');

      // Assert
      expect(initMock).toHaveBeenCalledWith({
        dsn: 'https://examplePublicDsn',
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        environment: 'preview',
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
        environment: getClientEnvironment(),
      });
    });
  });

  describe('instrumentation', () => {
    it('returns no initialization when DSNs are unset', async () => {
      // Arrange
      delete process.env.SENTRY_DSN;
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Act
      const instrumentation = await import('./instrumentation');
      await instrumentation.register();

      // Assert
      expect(initMock).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('logs one warning when DSNs are unset in production runtime', async () => {
      // Arrange
      delete process.env.SENTRY_DSN;
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
      process.env.VERCEL_ENV = 'production';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Act
      const instrumentation = await import('./instrumentation');
      await instrumentation.register();

      // Assert
      expect(initMock).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        SENTRY_DISABLED_IN_PRODUCTION_WARNING,
      );
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
        environment: getServerEnvironment(),
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
        environment: getServerEnvironment(),
      });
    });

    it('uses VERCEL_ENV when provided', async () => {
      // Arrange
      process.env.SENTRY_DSN = 'https://exampleServerDsn';
      process.env.VERCEL_ENV = 'preview';

      // Act
      const instrumentation = await import('./instrumentation');
      await instrumentation.register();

      // Assert
      expect(initMock).toHaveBeenCalledWith({
        dsn: 'https://exampleServerDsn',
        tracesSampleRate: 0,
        environment: 'preview',
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
