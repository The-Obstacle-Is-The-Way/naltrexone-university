# SPEC-016: Observability (Logging, Error Tracking, Monitoring)

> **Status:** Partially Implemented
> **Priority:** P1 (Critical for Production)
> **Author:** Claude
> **Created:** 2026-02-01

---

## Current State

✅ **Implemented:**
- `lib/logger.ts` - Pino structured JSON logger with redaction
- `pino` package installed (v10.3.0)
- Sentry error tracking (errors only) via `@sentry/nextjs` + Next instrumentation hooks

❌ **Not Yet Implemented:**
- `pino-pretty` for dev (optional, logs are readable without it)

---

## Problem

Production systems need observability to:
1. Debug issues when things go wrong
2. Track business events (subscriptions, failed payments)
3. Monitor performance and availability
4. Maintain audit trails for security/compliance

---

## Goals

1. **Structured logging** for server-side code (searchable, parseable) ✅
2. **Error tracking** with stack traces and context (client + server) ✅
3. **Request tracing** to follow requests across async boundaries (future)
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

### Logging Library: Pino ✅ IMPLEMENTED

We use [pino](https://github.com/pinojs/pino) - the fastest Node.js logger, optimized for Vercel:

- Outputs JSON (structured, searchable in Vercel logs)
- Minimal overhead (~5x faster than winston)
- Supports log levels, child loggers, redaction
- First-class Vercel/serverless support

### Error Tracking: Sentry ✅ IMPLEMENTED (Errors Only)

We use [Sentry](https://sentry.io) for error tracking:

- Captures unhandled exceptions with full stack traces
- Works on both client (React) and server (Node.js)
- Groups similar errors, tracks resolution
- Free tier sufficient for MVP

**Scope:** Errors only — performance tracing, replay, profiling, and source map upload are intentionally omitted for now.

---

## Architecture

### Clean Architecture Placement

```text
┌─────────────────────────────────────────────────────────────────┐
│           INFRASTRUCTURE (lib/ + framework config)               │
│                                                                  │
│   lib/logger.ts  ─── Pino instance, exported for use            │
│   instrumentation.ts         ─── Next server/edge instrumentation│
│   instrumentation-client.ts  ─── Next client instrumentation     │
│   sentry.client.config.ts    ─── Browser SDK initialization      │
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

### File: `lib/logger.ts` ✅ EXISTS

This is the **actual current implementation**:

```typescript
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
```

### Optional Enhancement: Child Loggers

If more granular logging is needed, add child loggers:

```typescript
// Add to lib/logger.ts if needed
export const dbLogger = logger.child({ module: 'database' });
export const stripeLogger = logger.child({ module: 'stripe' });
export const webhookLogger = logger.child({ module: 'webhook' });
```

### Sentry (Error Tracking)

Sentry is installed and configured for **error tracking only** (no performance tracing, replay, or profiling). Initialization is done manually to avoid committing secrets and to keep the setup minimal.

**Implementation:**
- Browser: `sentry.client.config.ts`
- Server/Edge: `instrumentation.ts` (`register()` calls `Sentry.init`, and `onRequestError` is wired via `Sentry.captureRequestError`)
- Client entry: `instrumentation-client.ts` (imports `sentry.client.config.ts`)

**Environment variables (do not commit real DSNs):**
- `NEXT_PUBLIC_SENTRY_DSN` (client)
- `SENTRY_DSN` (server; optional if using one DSN everywhere)

**Out of scope (future work):**
- source map upload (`SENTRY_AUTH_TOKEN` in CI only)
- performance tracing, replay, profiling
- attaching user PII (email, request bodies, tokens)

### Usage Examples

**In adapters (repositories, gateways):**

```typescript
// src/adapters/repositories/drizzle-subscription-repository.ts
import { logger } from '@/lib/logger';

export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  async findByUserId(userId: string): Promise<Subscription | null> {
    try {
      const row = await this.db.query.stripeSubscriptions.findFirst({
        where: eq(stripeSubscriptions.userId, userId),
      });
      return row ? this.toDomain(row) : null;
    } catch (error) {
      logger.error({ userId, error }, 'findByUserId failed');
      throw error;
    }
  }
}
```

**In webhook handlers:**

```typescript
// app/api/stripe/webhook/route.ts
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const event = await verifyAndParseEvent(req);
    logger.info({ type: event.type, stripeEventId: event.id }, 'webhook received');

    await processEvent(event);
    logger.info({ type: event.type }, 'webhook processed');

    return new Response('OK', { status: 200 });
  } catch (error) {
    logger.error({ error }, 'webhook failed');
    return new Response('Error', { status: 500 });
  }
}
```

**In use cases (audit logging):**

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

Currently in `.env.example`:

```bash
# LOG_LEVEL is supported but not documented in .env.example yet
LOG_LEVEL=debug                     # debug | info | warn | error (optional)

# SENTRY (Error Tracking)
NEXT_PUBLIC_SENTRY_DSN=             # Sentry DSN (from sentry.io)
SENTRY_DSN=                         # Server DSN (optional)
```

---

## Files

```text
.
├── instrumentation.ts         # ✅ EXISTS - Sentry.init + onRequestError for server/edge
├── instrumentation-client.ts  # ✅ EXISTS - loads sentry.client.config.ts on the client
├── sentry.client.config.ts    # ✅ EXISTS - browser Sentry.init (errors only)
└── lib/
    └── logger.ts              # ✅ EXISTS - Pino logger instance with redaction
```

---

## Dependencies

**Already Installed:**
```bash
pnpm add pino                        # ✅ v10.3.0 installed
pnpm add @sentry/nextjs              # ✅ Error tracking
```

**Optional (add when needed):**
```bash
pnpm add -D pino-pretty              # Pretty logs in dev terminal
```

---

## Acceptance Criteria

**Completed:**
- [x] `lib/logger.ts` exists with pino configured
- [x] JSON logs in production
- [x] Sensitive fields are redacted (`remove: true`)
- [x] No logging calls in `src/domain/**`
- [x] Sentry is initialized (client + server) when DSNs are configured

**Not Yet Done (Optional):**
- [ ] Pretty logs in dev (requires `pino-pretty`)
- [ ] LOG_LEVEL documented in .env.example

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
