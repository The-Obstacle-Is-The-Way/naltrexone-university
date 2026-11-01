import * as Sentry from '@sentry/nextjs';
import {
  SENTRY_CLIENT_SETTINGS,
  sentryEnvironmentFor,
} from '@/lib/sentry-data-collection';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  const environment = sentryEnvironmentFor(process.env.NEXT_PUBLIC_VERCEL_ENV);

  Sentry.init({ dsn, environment, ...SENTRY_CLIENT_SETTINGS });
}
