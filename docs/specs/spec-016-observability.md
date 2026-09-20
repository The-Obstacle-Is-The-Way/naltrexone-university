# SPEC-016: Observability (Logging, Error Tracking, Monitoring)

> **Status:** Implemented (Core) — Pino + Sentry bootstrap complete; DEBT-286 client-side reporting rollout resolved ([DEBT-286](../_archive/debt/debt-286-client-side-error-reporting.md))
> **Priority:** P1 (Critical for Production)
> **Author:** Claude
> **Created:** 2026-02-01
> **Updated:** 2026-09-20

---

## Current State

✅ **Implemented:**
- `lib/logger.ts` — Pino structured JSON logger with redaction; raw errors require `projectSafeErrorDiagnostics` before logging
- `pino` package installed (resolved version: `pnpm-lock.yaml`)
- Sentry errors on client/server, plus **5% server tracing** when a DSN is configured (`instrumentation.ts:19-23`); browser tracing and both replay rates remain **0** (`sentry.client.config.ts:9-14`)
- Sentry DSNs configured in Vercel (Production, Preview, Development) and local `.env.local`
- Server `onRequestError` wired to `Sentry.captureRequestError` for unhandled request errors
- Sentry environment auto-tagged via `VERCEL_ENV` / `NODE_ENV`
- `lib/report-client-error.ts` — shared client-side Sentry reporter with development console fallback
- `shouldReportClientError()` — filters expected `ActionResult` business errors out of client-side Sentry reporting
- Audited client-side operational failure paths now report via `reportClientError()` instead of raw console-only or silent fallback behavior
- Direct client-side Sentry capture remains centralized in `lib/report-client-error.ts`

❌ **Not Yet Implemented (Optional):**
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
3. **Request correlation and sampled server spans** implemented: `lib/request-context.ts:10-24` creates an explicit request ID and child logger; callers pass the context. This is not automatic async-local propagation. `src/adapters/shared/server-tracing.ts:133` wraps named spans with runtime-filtered attributes (DEBT-462 instrumentation; DEBT-475 typed boundary).
4. **Business event logging** for audit trails
5. **Zero logging in domain layer** (preserve purity)

---

## Non-Goals (MVP)

- Browser performance/RUM collection is not enabled; evaluate separately under DEBT-479 step 5. Vercel Web Analytics is traffic analytics, not a prerequisite for server tracing.
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

### Error Tracking and Sampled Server Tracing: Sentry ✅ IMPLEMENTED

We use [Sentry](https://sentry.io) for error tracking:

- Captures unhandled exceptions with full stack traces
- Works on both client (React) and server (Node.js)
- Groups similar errors, tracks resolution
- Free tier sufficient for MVP

**Scope:** Client/server error reporting and server performance tracing at `tracesSampleRate: 0.05`. Browser `tracesSampleRate` and both replay sample rates are zero. Profiling and source map upload are not configured. Sampling is not proof of samples for a particular action: the [2026-09-20 production readback](../debt/assets/adversarial-2026-09-20/review.md#server-trigger-adjudication) found production spans, but no matching action/DB spans for DEBT-450 in the queried 30-day window.

---

## Architecture

### Clean Architecture Placement

```text
┌──────────────────────────────────────────────────────────────────┐
│           INFRASTRUCTURE (lib/ + framework config)               │
│                                                                  │
│   lib/logger.ts  ─── Pino instance, exported for use             │
│   instrumentation.ts         ─── Next server/edge instrumentation│
│   instrumentation-client.ts  ─── Next client instrumentation     │
│   sentry.client.config.ts    ─── Browser SDK initialization      │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │                    ADAPTERS                              │   │
│   │                                                          │   │
│   │   Repositories: Log DB errors, slow queries              │   │
│   │   Gateways: Log external API calls (Stripe, Clerk)       │   │
│   │   Controllers: Log request/response, user context        │   │
│   │                                                          │   │
│   │   ┌──────────────────────────────────────────────────┐   │   │
│   │   │              APPLICATION (Use Cases)             │   │   │
│   │   │                                                  │   │   │
│   │   │   Log use case start/end for audit trail         │   │   │
│   │   │   Log business events (subscription created)     │   │   │
│   │   │                                                  │   │   │
│   │   │   ┌──────────────────────────────────────────┐   │   │   │
│   │   │   │              DOMAIN                      │   │   │   │
│   │   │   │                                          │   │   │   │
│   │   │   │   ⚠️  NO LOGGING HERE                    │   │   │   │
│   │   │   │   Pure functions, no side effects        │   │   │   │
│   │   │   │                                          │   │   │   │
│   │   │   └──────────────────────────────────────────┘   │   │   │
│   │   └──────────────────────────────────────────────────┘   │   │
│   └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**Key rule:** Domain layer has ZERO logging. It's pure TypeScript with no side effects.

---

## Implementation

### File: `lib/logger.ts` ✅ EXISTS

Implementation authority is [lib/logger.ts](../../lib/logger.ts); do not maintain a second purportedly exact copy here. A nonempty trimmed `LOG_LEVEL` overrides the default. Otherwise tests are silent, Vercel/Node production uses `info`, and other environments use `debug` (`lib/logger.ts:4-16`). The logger removes configured secret fields; unknown errors still require the separate safe diagnostic projector.

### Request Correlation and Sentry

- `lib/request-context.ts` creates request IDs and child loggers; `app/api/health/route.ts:12-13` is a consumer. Async-local propagation across every request is not claimed.
- Browser entry `instrumentation-client.ts` imports `sentry.client.config.ts` (errors only).
- Server/Edge entry `instrumentation.ts` initializes Sentry at 5% tracing and exposes `onRequestError`.
- `src/adapters/shared/server-tracing.ts` owns five registered families at six callers: finalize, bookmarks, stats, attempted questions, and Stripe webhook/retrieve. `lib/container/use-cases.ts:174` wraps the finalize transaction. The wrapper projects initial and later attributes; arbitrary PII, SQL and payloads are not permitted.
- DSNs: `NEXT_PUBLIC_SENTRY_DSN` (browser), `SENTRY_DSN` (server with public-DSN fallback). The 2026-09-20 Vercel key-name readback confirmed both in all three environments without exposing values.

**Not enabled:** browser performance tracing, replay, profiling, and source map upload. Adding browser sampling requires a separate quota/privacy decision and observed production measurements, not just changing a number. See DEBT-479 step 5. DEBT-450's server measurement work does not depend on that decision.

### Usage Examples

**Illustrative adapters (not a current implementation to copy):**

```typescript
// src/adapters/repositories/drizzle-subscription-repository.ts
import type { Logger } from '@/src/application/ports/logger';

export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: DrizzleDb, private readonly logger: Logger) {}

  async findByUserId(userId: string): Promise<Subscription | null> {
    try {
      const row = await this.db.query.stripeSubscriptions.findFirst({
        where: eq(stripeSubscriptions.userId, userId),
      });
      return row ? this.toDomain(row) : null;
    } catch (error) {
      this.logger.error({ userId }, 'findByUserId failed');
      throw error;
    }
  }
}
```

**Illustrative webhook handler (production error boundaries live in `app/api/stripe/webhook/handler.ts`):**

```typescript
// app/api/stripe/webhook/route.ts
import { logger } from '@/lib/logger';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';

export async function POST(req: Request) {
  try {
    const event = await verifyAndParseEvent(req);
    logger.info({ type: event.type, stripeEventId: event.id }, 'webhook received');

    await processEvent(event);
    logger.info({ type: event.type }, 'webhook processed');

    return new Response('OK', { status: 200 });
  } catch (error) {
    logger.error({ error: projectSafeErrorDiagnostics(error) }, 'webhook failed');
    return new Response('Error', { status: 500 });
  }
}
```

**In use cases (audit logging):**

```typescript
// src/application/use-cases/check-entitlement.ts
import type { Logger } from '@/src/application/ports/logger';

export class CheckEntitlementUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly logger: Logger,
  ) {}

  async execute(input: { userId: string }): Promise<{ isEntitled: boolean }> {
    const subscription = await this.subscriptions.findByUserId(input.userId);
    const result = isEntitled(subscription);

    // Audit log for business event
    this.logger.info(
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

`.env.example` documents the two Sentry DSNs. `LOG_LEVEL` is supported by `lib/logger.ts:4-16`; **adding it to `.env.example` is declined as an optional documentation expansion in this pass**, not a missing runtime feature. Defaults and override behavior are specified above. `pino-pretty` remains optional and unimplemented.

```bash
NEXT_PUBLIC_SENTRY_DSN=             # Browser DSN
SENTRY_DSN=                         # Server DSN (public DSN is fallback)
```

---

## Files

```text
.
├── instrumentation.ts         # ✅ EXISTS - Sentry.init + onRequestError for server/edge
├── instrumentation-client.ts  # ✅ EXISTS - loads sentry.client.config.ts on the client
├── sentry.client.config.ts    # ✅ EXISTS - browser Sentry.init (errors only)
└── lib/
    ├── logger.ts              # ✅ EXISTS - Pino logger instance with redaction
    └── report-client-error.ts # ✅ EXISTS - shared client-side error reporter
```

---

## Dependencies

**Already Installed:**
```bash
pnpm add pino                        # Installed; version authority is the lockfile
pnpm add @sentry/nextjs              # Errors and sampled server tracing
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
- `LOG_LEVEL` example-file addition: declined optional (2026-09-20); supported behavior documented above.

**Completed (DEBT-286: Client-Side Error Reporting):**
- [x] `reportClientError()` utility exists in `lib/`
- [x] Caught client-side operational failures are reported via `reportClientError()` → Sentry
- [x] Helper-level client catch sites that currently collapse thrown/rejected server-action calls into fallback UI state are routed through `reportClientError()` or explicitly justified
- [x] Direct client-side error reporting uses `reportClientError()` unless a fallback/error-boundary path is explicitly retained and documented
- [x] Bare `catch {}` blocks that swallow unexpected client-side operational failures are eliminated or explicitly justified

Route/global error-boundary console cleanup remains observability-adjacent work, but it is not part of the core DEBT-286 rollout inventory unless that debt is explicitly expanded.

See [DEBT-286](../_archive/debt/debt-286-client-side-error-reporting.md) for the full rollout plan and target inventory.

**Completed (DEBT-249 Rollout Instrumentation):**
- [x] Auth bounce count on `/checkout/success` — track middleware redirect bounces on this route
- [x] % of checkout-success requests missing `session_id` — detect Stripe return URLs that lost the query param
- [x] Checkout error redirect rate (`/pricing?checkout=error`) — monitor how often the success page fails and falls back to the error redirect

---

## Testing

Logging is infrastructure - test behavior, not log output.

For critical audit logs, you can:
1. Use a fake logger in tests to verify calls
2. Assert redaction/filtering behavior where it is a security boundary; logging is not exempt from regression testing.

```typescript
// If you need to verify logging in tests:
import { FakeLogger } from '@/src/application/test-helpers/fakes';

const logger = new FakeLogger();
// Assert against logger.infoCalls / logger.errorCalls

// For the shared client reporter utility, mock only the external SDK:
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
```

For client-side reporting consumers:
1. Unit-test `lib/report-client-error.ts` by mocking only `@sentry/nextjs`
2. In hook/controller/component tests that only verify wiring, mock `@/lib/report-client-error` and assert the wrapper is called with the expected context instead of mocking the Sentry SDK in every consumer test

---

## References

- [Pino Documentation](https://github.com/pinojs/pino)
- [Sentry Next.js Guide](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Vercel Logging](https://vercel.com/docs/observability/runtime-logs)
- [12-Factor App: Logs](https://12factor.net/logs)
