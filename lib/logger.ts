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
// Never log these env vars if accidentally attached. The logger test checks
// this list against every secret the env schema declares, and every one the
// source reads from process.env (BUG-325).
export const SECRET_ENV_NAMES: readonly string[] = [
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SIGNING_SECRET',
  'CONSENT_STATE_SECRET',
  'CRON_SECRET',
  'GITHUB_READ_TOKEN',
  'DATABASE_URL',
  'E2E_CLERK_USER_PASSWORD',
  'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'SENTRY_WATCHER_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

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
  // Each secret at the top level, or one level down (env, config, ...).
  ...SECRET_ENV_NAMES.flatMap((name) => [name, `*.${name}`]),
];

export const logger = pino({
  level,
  redact: {
    paths: [...LOGGER_REDACT_PATHS],
    remove: true,
  },
});
