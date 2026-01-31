# ADR-008: Logging and Observability Strategy

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers), ADR-006 (Error Handling)

---

## Context

We need a logging and observability strategy that:

1. Provides **visibility** into application behavior in production
2. Supports **debugging** without exposing sensitive data
3. Is **structured** for easy searching and alerting
4. Works with **Vercel** deployment (serverless environment)
5. Follows **Clean Architecture** — logging is infrastructure, not domain
6. Enables **correlation** across distributed requests

**Key concerns:**
- What to log (and what NOT to log)
- Log levels and when to use each
- Structured vs unstructured logging
- Performance impact
- HIPAA/PII considerations (medical education context)

## Decision

We adopt **Structured JSON Logging** with **Pino** as the logging library, writing to stdout for Vercel Log Drain integration.

### Logging Principles

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              NEVER LOG                                   │
│                                                                          │
│   - Passwords, tokens, API keys                                          │
│   - Full credit card numbers                                             │
│   - User email addresses (use userId instead)                           │
│   - Health information (this is a medical education app)                │
│   - Full request/response bodies                                        │
│   - Stack traces to client (server logs only)                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                              ALWAYS LOG                                  │
│                                                                          │
│   - Request ID for correlation                                           │
│   - User ID (internal UUID, not email)                                  │
│   - Action name (e.g., 'submitAnswer', 'createCheckoutSession')         │
│   - Outcome (success, error code)                                        │
│   - Duration (for performance monitoring)                                │
│   - Error messages (sanitized)                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Log Levels

| Level | When to Use | Example |
|-------|-------------|---------|
| `fatal` | Application cannot continue | Database connection failed on startup |
| `error` | Operation failed unexpectedly | Unhandled exception in webhook |
| `warn` | Unusual but handled situation | Rate limit approaching, retry occurred |
| `info` | Significant business events | User subscribed, session completed |
| `debug` | Detailed diagnostic info | Query executed, cache hit/miss |
| `trace` | Very detailed tracing | Function entry/exit (rarely used) |

**Production default:** `info`
**Development default:** `debug`

### Logger Implementation

```typescript
// lib/logger.ts
import 'server-only';
import pino from 'pino';
import { env } from './env';

const isProduction = env.NODE_ENV === 'production';

export const logger = pino({
  level: isProduction ? 'info' : 'debug',

  // Vercel-friendly JSON output
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true },
      },

  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'token',
      'authorization',
      'cookie',
      'email',
      'stripeCustomerId',
      '*.password',
      '*.token',
      '*.email',
    ],
    remove: true,
  },

  // Standard fields for all logs
  base: {
    service: 'naltrexone-university',
    version: env.VERCEL_GIT_COMMIT_SHA ?? 'local',
  },
});

// Child logger with request context
export function createRequestLogger(requestId: string, userId?: string) {
  return logger.child({
    requestId,
    userId,
  });
}

export type Logger = typeof logger;
```

### Request Context

Use Vercel's request ID or generate one:

```typescript
// lib/request-context.ts
import 'server-only';
import { headers } from 'next/headers';
import { createRequestLogger, type Logger } from './logger';

export async function getRequestLogger(userId?: string): Promise<Logger> {
  const headersList = await headers();
  const requestId =
    headersList.get('x-vercel-id') ??
    headersList.get('x-request-id') ??
    crypto.randomUUID();

  return createRequestLogger(requestId, userId);
}
```

### Logging in Controllers

```typescript
// src/adapters/controllers/question-controller.ts
'use server';

import { getRequestLogger } from '@/lib/request-context';
import { getAuthGateway, createSubmitAnswerUseCase } from '@/lib/container';

export async function submitAnswer(
  questionId: string,
  choiceId: string
): Promise<ActionResult<SubmitAnswerOutput>> {
  const startTime = performance.now();
  let log = await getRequestLogger();

  try {
    const authGateway = getAuthGateway();
    const user = await authGateway.requireUser();

    // Add user context to logger
    log = log.child({ userId: user.id });

    log.info({ action: 'submitAnswer', questionId }, 'Starting answer submission');

    const useCase = createSubmitAnswerUseCase();
    const result = await useCase.execute({
      userId: user.id,
      questionId,
      choiceId,
    });

    const duration = performance.now() - startTime;
    log.info(
      {
        action: 'submitAnswer',
        questionId,
        isCorrect: result.isCorrect,
        durationMs: Math.round(duration),
      },
      'Answer submitted successfully'
    );

    return ok(result);
  } catch (error) {
    const duration = performance.now() - startTime;

    if (isApplicationError(error)) {
      log.warn(
        {
          action: 'submitAnswer',
          questionId,
          errorCode: error.code,
          durationMs: Math.round(duration),
        },
        error.message
      );
      return handleError(error);
    }

    log.error(
      {
        action: 'submitAnswer',
        questionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        durationMs: Math.round(duration),
      },
      'Unexpected error during answer submission'
    );

    return handleError(error);
  }
}
```

### Logging in Domain Layer — DON'T

The domain layer has **zero dependencies**, including logging. If you need to trace domain logic:

1. Log at the use case level (before/after domain calls)
2. Use return values to communicate state
3. If truly needed, inject a logging port (interface) into the use case

```typescript
// BAD - domain with logging
function gradeAnswer(question: Question, choiceId: string, logger: Logger) {
  logger.debug('Grading answer...'); // NO!
}

// GOOD - log at use case level
class SubmitAnswerUseCase {
  async execute(input: SubmitAnswerInput): Promise<Output> {
    // Domain is pure - no logging inside
    const result = gradeAnswer(question, input.choiceId);

    // Log at orchestration level if needed
    // (though usually controller-level is sufficient)
  }
}
```

### Webhook Logging

Stripe webhooks need special attention:

```typescript
// app/api/stripe/webhook/route.ts
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const log = logger.child({
    route: '/api/stripe/webhook',
    requestId: request.headers.get('x-vercel-id'),
  });

  const eventId = request.headers.get('stripe-signature')?.slice(0, 20);
  log.info({ eventId }, 'Webhook received');

  try {
    const result = await paymentGateway.processWebhookEvent(body, signature);

    if (result.processed) {
      log.info(
        {
          eventId,
          eventType: result.eventType,
          userId: result.subscriptionUpdate?.userId,
        },
        'Webhook processed successfully'
      );
    } else {
      log.debug({ eventId }, 'Webhook event ignored');
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    log.error(
      {
        eventId,
        error: error instanceof Error ? error.message : 'Unknown',
      },
      'Webhook processing failed'
    );
    return NextResponse.json({ error: 'Webhook failed' }, { status: 400 });
  }
}
```

### Performance Monitoring

Track key metrics:

```typescript
// lib/metrics.ts
import { logger } from './logger';

export function trackDuration(
  action: string,
  fn: () => Promise<unknown>
): Promise<unknown> {
  const start = performance.now();
  return fn().finally(() => {
    const duration = performance.now() - start;
    logger.info({ action, durationMs: Math.round(duration) }, 'Action completed');
  });
}

// Usage in server action
export async function getNextQuestion(sessionId?: string) {
  return trackDuration('getNextQuestion', async () => {
    // actual logic
  });
}
```

### Error Alerting Thresholds

Configure alerts in Vercel/external monitoring:

| Metric | Warning | Critical |
|--------|---------|----------|
| Error rate | > 1% of requests | > 5% of requests |
| P95 latency | > 2s | > 5s |
| Webhook failures | > 3 in 1 hour | > 10 in 1 hour |
| Auth failures | > 10 in 10 min | > 50 in 10 min |

### Log Retention

- **Vercel**: 1 hour for Hobby, 3 days for Pro
- **Log Drain** to Datadog/Logtail for longer retention (recommended for production)

## Consequences

### Positive

1. **Debuggability** — Structured logs with request ID correlation
2. **Security** — Sensitive data redacted automatically
3. **Performance** — Pino is fast, JSON is compact
4. **Clean Architecture** — Logging stays in infrastructure layer

### Negative

1. **Verbosity** — More code for logging
2. **Cost** — Log drain services cost money for high volume

### Mitigations

- Create logging utilities to reduce boilerplate
- Use log levels appropriately to control volume
- Sample debug logs in production if needed

## Compliance Checklist

- [ ] No PII (email, names) in logs — use userId only
- [ ] No secrets/tokens in logs
- [ ] Request ID present in all controller logs
- [ ] Duration tracked for key operations
- [ ] Error logs include sanitized error messages
- [ ] Domain layer has zero logging imports

## References

- [Pino - super fast Node.js logger](https://github.com/pinojs/pino)
- [Vercel Log Drains](https://vercel.com/docs/observability/log-drains)
- [Structured Logging Best Practices](https://www.loggly.com/use-cases/structured-logging/)
