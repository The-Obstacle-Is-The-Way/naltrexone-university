import * as Sentry from '@sentry/nextjs';

export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
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
