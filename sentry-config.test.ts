// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initMock = vi.fn();
const captureRequestErrorMock = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  init: initMock,
  captureRequestError: captureRequestErrorMock,
}));

// DEBT-499 / BUG-318: what every runtime may send. Imported after the code
// under test, from the same module registry, so the functions are the ones
// it passed.
async function sentryPrivacyOptions() {
  const privacy = await import('@/lib/sentry-data-collection');
  return {
    dataCollection: privacy.SENTRY_DATA_COLLECTION,
    beforeSend: privacy.scrubEvent,
    beforeBreadcrumb: privacy.scrubBreadcrumb,
  };
}

// BUG-331: the server sends no breadcrumbs, and scrubs span URLs.
async function sentryServerPrivacyOptions() {
  const privacy = await import('@/lib/sentry-data-collection');
  return {
    maxBreadcrumbs: 0,
    // DEBT-505: no release-health session, which would copy the scope's user
    // past beforeSend.
    integrations: privacy.withoutProcessSession,
    dataCollection: privacy.SENTRY_DATA_COLLECTION,
    beforeSend: privacy.scrubServerEvent,
    beforeSendSpan: privacy.scrubSpan,
  };
}

describe('Sentry configuration', () => {
  const originalEnv = { ...process.env };

  const getClientEnvironment = () =>
    process.env.NEXT_PUBLIC_VERCEL_ENV?.trim() || 'local';

  const getServerEnvironment = () => process.env.VERCEL_ENV?.trim() || 'local';

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
        ...(await sentryPrivacyOptions()),
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
        ...(await sentryPrivacyOptions()),
      });
    });

    it('labels a production build off Vercel as local', async () => {
      // Arrange
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://examplePublicDsn';
      delete process.env.NEXT_PUBLIC_VERCEL_ENV;
      Object.assign(process.env, { NODE_ENV: 'production' });

      // Act
      await import('./sentry.client.config');

      // Assert
      expect(initMock).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'local' }),
      );
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
        ...(await sentryPrivacyOptions()),
      });
    });
  });

  describe('instrumentation', () => {
    let instrumentation: typeof import('./instrumentation');

    beforeEach(async () => {
      instrumentation = await import('./instrumentation');
    });

    it('returns no initialization when DSNs are unset', async () => {
      // Arrange
      delete process.env.SENTRY_DSN;
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
      delete process.env.VERCEL_ENV;
      process.env = { ...process.env, NODE_ENV: 'test' };
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Act
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
      await instrumentation.register();

      // Assert
      expect(initMock).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        instrumentation.SENTRY_DISABLED_IN_PRODUCTION_WARNING,
      );
    });

    it('returns initialized client using SENTRY_DSN when set', async () => {
      // Arrange
      process.env.SENTRY_DSN = 'https://exampleServerDsn';

      // Act
      await instrumentation.register();

      // Assert
      expect(initMock).toHaveBeenCalledWith({
        dsn: 'https://exampleServerDsn',
        tracesSampleRate: 0.05,
        environment: getServerEnvironment(),
        ...(await sentryServerPrivacyOptions()),
      });
    });

    // DEBT-505: the browser's key is public, so server events, operational
    // alerts among them, go only to the server project's key.
    it('never sends server events with the browser key', async () => {
      // Arrange
      delete process.env.SENTRY_DSN;
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://examplePublicDsn';

      // Act
      await instrumentation.register();

      // Assert
      expect(initMock).not.toHaveBeenCalled();
    });

    it('uses VERCEL_ENV when provided', async () => {
      // Arrange
      process.env.SENTRY_DSN = 'https://exampleServerDsn';
      process.env.VERCEL_ENV = 'preview';

      // Act
      await instrumentation.register();

      // Assert
      expect(initMock).toHaveBeenCalledWith({
        dsn: 'https://exampleServerDsn',
        tracesSampleRate: 0.05,
        environment: 'preview',
        ...(await sentryServerPrivacyOptions()),
      });
    });

    // DEBT-505: `next start` is a production build, but off Vercel it is not
    // production; an event labelled so would page the owner.
    it('labels a production build off Vercel as local', async () => {
      // Arrange
      process.env.SENTRY_DSN = 'https://exampleServerDsn';
      delete process.env.VERCEL_ENV;
      Object.assign(process.env, { NODE_ENV: 'production' });

      // Act
      await instrumentation.register();

      // Assert
      expect(initMock).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'local' }),
      );
    });

    it('returns onRequestError as captureRequestError', async () => {
      // Arrange
      // (mocks are defined at module scope)

      // Act
      expect(instrumentation.onRequestError).toBe(captureRequestErrorMock);
    });
  });
});
