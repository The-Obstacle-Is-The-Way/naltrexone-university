import * as Sentry from '@sentry/nextjs';
import {
  SENTRY_SERVER_SETTINGS,
  sentryEnvironmentFor,
} from '@/lib/sentry-data-collection';

export const SENTRY_DISABLED_IN_PRODUCTION_WARNING =
  '[SENTRY_DISABLED] Sentry DSN is not configured; server telemetry is disabled.';

export async function register() {
  // The server project's key only. The browser's key is public by design, so
  // events sent with it, operational alerts among them, could be forged
  // (DEBT-505).
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    if (process.env.VERCEL_ENV?.trim() === 'production') {
      console.warn(SENTRY_DISABLED_IN_PRODUCTION_WARNING);
    }
    return;
  }

  const environment = sentryEnvironmentFor(process.env.VERCEL_ENV);

  Sentry.init({ dsn, environment, ...SENTRY_SERVER_SETTINGS });
}

export const onRequestError = Sentry.captureRequestError;
