import { describe, expect, it } from 'vitest';

describe('proxy Sentry endpoint parsing', () => {
  describe('parseSentryIngestOrigin', () => {
    it('extracts the origin from a valid Sentry DSN', async () => {
      const { parseSentryIngestOrigin } = await import('./proxy');
      expect(
        parseSentryIngestOrigin('https://abc123@o456.ingest.us.sentry.io/789'),
      ).toBe('https://o456.ingest.us.sentry.io');
    });

    it('returns null when DSN uses an opaque origin scheme', async () => {
      const { parseSentryIngestOrigin } = await import('./proxy');
      expect(parseSentryIngestOrigin('mailto:test@example.com')).toBeNull();
    });

    it('returns null when DSN uses a non-http scheme', async () => {
      const { parseSentryIngestOrigin } = await import('./proxy');
      expect(parseSentryIngestOrigin('ftp://example.com/123')).toBeNull();
    });

    it('returns null when DSN is undefined', async () => {
      const { parseSentryIngestOrigin } = await import('./proxy');
      expect(parseSentryIngestOrigin(undefined)).toBeNull();
    });

    it('returns null when DSN is empty string', async () => {
      const { parseSentryIngestOrigin } = await import('./proxy');
      expect(parseSentryIngestOrigin('')).toBeNull();
    });

    it('returns null when DSN is not a valid URL', async () => {
      const { parseSentryIngestOrigin } = await import('./proxy');
      expect(parseSentryIngestOrigin('not-a-url')).toBeNull();
    });
  });

  describe('parseSentrySecurityHeaderEndpoint', () => {
    it('builds the Sentry security header endpoint from a valid DSN', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint(
          'https://abc123@o456.ingest.us.sentry.io/789',
        ),
      ).toBe(
        'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123',
      );
    });

    it('preserves DSN path prefixes when building the security header endpoint', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint(
          'https://abc123@example.com/sentry/project/789',
        ),
      ).toBe(
        'https://example.com/sentry/project/api/789/security/?sentry_key=abc123',
      );
    });

    it('appends sentry_environment when environment is provided', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint(
          'https://abc123@o456.ingest.us.sentry.io/789',
          'preview',
        ),
      ).toBe(
        'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123&sentry_environment=preview',
      );
    });

    it('omits sentry_environment when environment is undefined', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint(
          'https://abc123@o456.ingest.us.sentry.io/789',
          undefined,
        ),
      ).toBe(
        'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123',
      );
    });

    it('omits sentry_environment when environment is empty string', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint(
          'https://abc123@o456.ingest.us.sentry.io/789',
          '',
        ),
      ).toBe(
        'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123',
      );
    });

    it('returns null when the DSN uses a non-http scheme', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint('ftp://abc123@example.com/789'),
      ).toBeNull();
    });

    it('returns null when the DSN is not a valid URL', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(parseSentrySecurityHeaderEndpoint('not-a-url')).toBeNull();
    });

    it('returns null when the DSN has no public key', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint('https://example.com/789'),
      ).toBeNull();
    });

    it('returns null when the DSN has no project id', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint('https://abc123@example.com'),
      ).toBeNull();
    });
  });
});
