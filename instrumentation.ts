import * as Sentry from '@sentry/nextjs';
import {
  SENTRY_DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
  sentryEnvironmentFor,
} from '@/lib/sentry-data-collection';

export const SENTRY_DISABLED_IN_PRODUCTION_WARNING =
  '[SENTRY_DISABLED] Sentry DSN is not configured; server telemetry is disabled.';

export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    if (process.env.VERCEL_ENV?.trim() === 'production') {
      console.warn(SENTRY_DISABLED_IN_PRODUCTION_WARNING);
    }
    return;
  }

  const environment = sentryEnvironmentFor(process.env.VERCEL_ENV);

  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
    environment,
    dataCollection: SENTRY_DATA_COLLECTION,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

export const onRequestError = Sentry.captureRequestError;
