import 'server-only';
import pino from 'pino';

const envLevel = process.env.LOG_LEVEL?.trim();

const nodeEnv = process.env.NODE_ENV?.trim();
const vercelEnv = process.env.VERCEL_ENV?.trim();
const runtimeEnv = nodeEnv === 'test' ? 'test' : vercelEnv || nodeEnv;

const level =
  envLevel ||
  (runtimeEnv === 'production'
    ? 'info'
    : runtimeEnv === 'test'
      ? 'silent'
      : 'debug');

/**
 * Structured JSON logger (Vercel-friendly).
 *
 * Security note: do not log PII (emails) or secrets. Prefer logging internal IDs.
 * Raw unknown errors at `err`/`error` seams must pass through
 * `projectSafeErrorDiagnostics`; Pino redaction is not that boundary.
 */
export const LOGGER_REDACT_PATHS: readonly string[] = [
  // Common HTTP secret locations
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["stripe-signature"]',
  'headers.authorization',
  'headers.cookie',
  'headers["stripe-signature"]',
  // Common auth/billing fields
  'authorization',
  'cookie',
  'stripeSignature',
  // Never log these env vars if accidentally attached; the logger test
  // checks this list against every secret the env schema declares.
  'env.CLERK_SECRET_KEY',
  'env.CLERK_WEBHOOK_SIGNING_SECRET',
  'env.STRIPE_SECRET_KEY',
  'env.STRIPE_WEBHOOK_SECRET',
  'env.CONSENT_STATE_SECRET',
  'env.CRON_SECRET',
  'env.DATABASE_URL',
  'env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
  'env.RESEND_API_KEY',
  'env.RESEND_WEBHOOK_SECRET',
];

export const logger = pino({
  level,
  redact: {
    paths: [...LOGGER_REDACT_PATHS],
    remove: true,
  },
});
