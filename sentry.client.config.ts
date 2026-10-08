import * as Sentry from '@sentry/nextjs';
import {
  SENTRY_DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
  sentryEnvironmentFor,
} from '@/lib/sentry-data-collection';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  const environment = sentryEnvironmentFor(process.env.NEXT_PUBLIC_VERCEL_ENV);

  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment,
    dataCollection: SENTRY_DATA_COLLECTION,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
