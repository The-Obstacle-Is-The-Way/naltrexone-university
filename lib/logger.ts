import 'server-only';
import pino from 'pino';

const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

/**
 * Structured JSON logger (Vercel-friendly).
 *
 * Security note: do not log PII (emails) or secrets. Prefer logging internal IDs.
 */
export const logger = pino({
  level,
  redact: {
    paths: [
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
      // Never log these env vars if accidentally attached
      'env.CLERK_SECRET_KEY',
      'env.STRIPE_SECRET_KEY',
      'env.STRIPE_WEBHOOK_SECRET',
    ],
    remove: true,
  },
});
