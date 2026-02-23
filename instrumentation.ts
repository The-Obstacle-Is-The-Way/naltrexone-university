import * as Sentry from '@sentry/nextjs';

const SENTRY_DISABLED_IN_PRODUCTION_WARNING =
  '[SENTRY_DISABLED] Sentry DSN is not configured; server telemetry is disabled.';

export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    if (process.env.VERCEL_ENV?.trim() === 'production') {
      console.warn(SENTRY_DISABLED_IN_PRODUCTION_WARNING);
    }
    return;
  }

  const environment =
    process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim();

  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    environment,
  });
}

export const onRequestError = Sentry.captureRequestError;
