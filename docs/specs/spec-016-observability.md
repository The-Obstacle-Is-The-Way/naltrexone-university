# SPEC-016: Observability (Logging, Error Tracking, Monitoring)

> **Status:** Proposed
> **Priority:** P1 (Critical for Production)
> **Author:** Claude
> **Created:** 2026-02-01

---

## Problem

Production systems need observability to:
1. Debug issues when things go wrong
2. Track business events (subscriptions, failed payments)
3. Monitor performance and availability
4. Maintain audit trails for security/compliance

Currently, we have no structured logging, error tracking, or monitoring strategy.

---

## Goals

1. **Structured logging** for server-side code (searchable, parseable)
2. **Error tracking** with stack traces and context (client + server)
3. **Request tracing** to follow requests across async boundaries
4. **Business event logging** for audit trails
5. **Zero logging in domain layer** (preserve purity)

---

## Non-Goals (MVP)

- APM (Application Performance Monitoring) - use Vercel Analytics
- Custom metrics dashboards - use Vercel's built-in
- Log aggregation beyond Vercel's log drain
- Distributed tracing across services (we're monolithic)

---

## Decision

### Logging Library: Pino

Use [pino](https://github.com/pinojs/pino) - the fastest Node.js logger, optimized for Vercel:

- Outputs JSON (structured, searchable in Vercel logs)
- Minimal overhead (~5x faster than winston)
- Supports log levels, child loggers, redaction
- First-class Vercel/serverless support

### Error Tracking: Sentry

Use [Sentry](https://sentry.io) for error tracking:

- Captures unhandled exceptions with full stack traces
- Works on both client (React) and server (Node.js)
- Groups similar errors, tracks resolution
- Free tier sufficient for MVP

---

## Architecture

### Clean Architecture Placement

```text
┌─────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE (lib/)                         │
│                                                                  │
│   lib/logger.ts  ─── Pino instance, exported for use            │
│   lib/sentry.ts  ─── Sentry initialization                      │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │                    ADAPTERS                               │  │
│   │                                                           │  │
│   │   Repositories: Log DB errors, slow queries              │  │
│   │   Gateways: Log external API calls (Stripe, Clerk)       │  │
│   │   Controllers: Log request/response, user context         │  │
│   │                                                           │  │
│   │   ┌──────────────────────────────────────────────────┐   │  │
│   │   │              APPLICATION (Use Cases)              │   │  │
│   │   │                                                   │   │  │
│   │   │   Log use case start/end for audit trail         │   │  │
│   │   │   Log business events (subscription created)      │   │  │
│   │   │                                                   │   │  │
│   │   │   ┌──────────────────────────────────────────┐   │   │  │
│   │   │   │              DOMAIN                       │   │   │  │
│   │   │   │                                           │   │   │  │
│   │   │   │   ⚠️  NO LOGGING HERE                    │   │   │  │
│   │   │   │   Pure functions, no side effects        │   │   │  │
│   │   │   │                                           │   │   │  │
│   │   │   └──────────────────────────────────────────┘   │   │  │
│   │   └──────────────────────────────────────────────────┘   │  │
│   └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Key rule:** Domain layer has ZERO logging. It's pure TypeScript with no side effects.

---

## Implementation

### File: `lib/logger.ts`

```typescript
import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const isVercel = !!process.env.VERCEL;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),

  // JSON in production (Vercel parses it), pretty in dev
  transport: isProduction || isVercel
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true } },

  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
    ],
    censor: '[REDACTED]',
  },

  // Base context for all logs
  base: {
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    region: process.env.VERCEL_REGION,
  },
});

// Child loggers for specific contexts
export const dbLogger = logger.child({ module: 'database' });
export const stripeLogger = logger.child({ module: 'stripe' });
export const clerkLogger = logger.child({ module: 'clerk' });
export const webhookLogger = logger.child({ module: 'webhook' });

// Log levels reference:
// - error: Errors that need immediate attention
// - warn: Unexpected but handled situations
// - info: Business events, request lifecycle (default in prod)
// - debug: Detailed debugging (dev only)
// - trace: Very verbose tracing (rarely used)
```

### File: `lib/sentry.ts`

```typescript
import * as Sentry from '@sentry/nextjs';

export function initSentry() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

    // Capture 100% of errors, sample 10% of transactions
    tracesSampleRate: 0.1,

    // Don't send errors in development
    enabled: process.env.NODE_ENV === 'production',

    // Ignore common non-actionable errors
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
    ],
  });
}

// Helper to capture errors with context
export function captureError(error: Error, context?: Record<string, unknown>) {
  Sentry.captureException(error, { extra: context });
}

// Helper to add user context (call after auth)
export function setUserContext(userId: string, email?: string) {
  Sentry.setUser({ id: userId, email });
}
```

### Usage in Adapters

```typescript
// src/adapters/repositories/drizzle-subscription-repository.ts
import { dbLogger } from '@/lib/logger';

export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  async findByUserId(userId: string): Promise<Subscription | null> {
    const start = Date.now();

    try {
      const row = await this.db.query.stripeSubscriptions.findFirst({
        where: eq(stripeSubscriptions.userId, userId),
      });

      dbLogger.debug({ userId, found: !!row, ms: Date.now() - start }, 'findByUserId');
      return row ? this.toDomain(row) : null;

    } catch (error) {
      dbLogger.error({ userId, error }, 'findByUserId failed');
      throw error;
    }
  }
}
```

### Usage in Webhook Handler

```typescript
// app/api/stripe/webhook/route.ts
import { webhookLogger } from '@/lib/logger';
import { captureError } from '@/lib/sentry';

export async function POST(req: Request) {
  const eventId = crypto.randomUUID();
  const log = webhookLogger.child({ eventId });

  try {
    const event = await verifyAndParseEvent(req);
    log.info({ type: event.type, stripeEventId: event.id }, 'webhook received');

    await processEvent(event);
    log.info({ type: event.type }, 'webhook processed');

    return new Response('OK', { status: 200 });

  } catch (error) {
    log.error({ error }, 'webhook failed');
    captureError(error as Error, { eventId });
    return new Response('Error', { status: 500 });
  }
}
```

### Usage in Use Cases (Audit Logging)

```typescript
// src/application/use-cases/check-entitlement.ts
import { logger } from '@/lib/logger';

export class CheckEntitlementUseCase {
  async execute(input: { userId: string }): Promise<{ isEntitled: boolean }> {
    const subscription = await this.subscriptions.findByUserId(input.userId);
    const result = isEntitled(subscription);

    // Audit log for business event
    logger.info(
      { userId: input.userId, isEntitled: result, plan: subscription?.plan },
      'entitlement checked'
    );

    return { isEntitled: result };
  }
}
```

---

## Log Levels Guide

| Level | When to Use | Example |
|-------|-------------|---------|
| `error` | Unexpected failures needing attention | DB connection failed, Stripe API error |
| `warn` | Handled but unexpected situations | Retry succeeded, deprecated usage |
| `info` | Business events, request lifecycle | User subscribed, webhook processed |
| `debug` | Detailed debugging (dev only) | Query params, intermediate state |

---

## What NOT to Log

1. **Sensitive data**: Passwords, tokens, full credit card numbers, PII beyond user ID
2. **Domain layer**: No logging in `src/domain/**` (keep it pure)
3. **High-frequency operations**: Don't log every render, every cache hit
4. **Successful health checks**: They just add noise

---

## Environment Variables

Add to `.env.example`:

```bash
# Observability (Optional for dev, required for prod)
LOG_LEVEL=debug                     # debug | info | warn | error
NEXT_PUBLIC_SENTRY_DSN=             # Sentry DSN (from sentry.io)
SENTRY_AUTH_TOKEN=                  # For source map upload in CI
```

---

## Files to Create

```text
lib/
├── logger.ts         # Pino logger instance + child loggers
└── sentry.ts         # Sentry initialization + helpers
```

Plus Sentry config files (generated by `npx @sentry/wizard@latest -i nextjs`):
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`

---

## Dependencies

```bash
pnpm add pino
pnpm add -D pino-pretty              # Pretty logs in dev
pnpm add @sentry/nextjs              # Error tracking
```

---

## Acceptance Criteria

- [ ] `lib/logger.ts` exists with pino configured
- [ ] JSON logs in production, pretty logs in dev
- [ ] Sensitive fields are redacted
- [ ] Sentry captures unhandled errors (client + server)
- [ ] Webhook handler logs all events with event ID
- [ ] No logging calls in `src/domain/**`
- [ ] LOG_LEVEL and SENTRY_DSN documented in .env.example

---

## Testing

Logging is infrastructure - test behavior, not log output.

For critical audit logs, you can:
1. Use a fake logger in tests to verify calls
2. Or just trust the implementation (logs are observability, not behavior)

```typescript
// If you need to verify logging in tests:
const mockLogger = { info: vi.fn(), error: vi.fn() };
// Inject via dependency injection or module mock
```

---

## References

- [Pino Documentation](https://github.com/pinojs/pino)
- [Sentry Next.js Guide](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Vercel Logging](https://vercel.com/docs/observability/runtime-logs)
- [12-Factor App: Logs](https://12factor.net/logs)
