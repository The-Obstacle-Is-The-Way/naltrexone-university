import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  const environment =
    process.env.NEXT_PUBLIC_VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim();

  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment,
  });
}
