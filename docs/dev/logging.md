# Logging

**Last Updated:** 2026-03-17

## Source of truth

- Implementation: `lib/logger.ts` (Pino)
- Adapter contract: `src/application/ports/logger.ts`
- Request-scoped helpers: `lib/request-context.ts`
- Server telemetry bootstrap: `instrumentation.ts`
- Client telemetry helper: `lib/report-client-error.ts`

## Adapter logger contract

Adapters (controllers, gateways, repositories) depend on a minimal `Logger` interface:

- Methods: `debug`, `info`, `warn`, `error`
- Signature: `(context, message)`

This matches Pino’s native API so log fields stay structured:

```ts
logger.warn({ userId, attempt }, 'Retrying external API call');
logger.error({ error, eventId }, 'Stripe webhook failed');
```

## Default levels

Unless `LOG_LEVEL` is explicitly set:

- Test: `silent`
- Development / Vercel preview: `debug`
- Production / Vercel production: `info`

This behavior is covered by `lib/logger.test.ts`.

## Request-scoped logging

Route handlers should create a request context and derive a child logger:

```ts
const ctx = createRequestContext();
const logger = getRequestLogger(ctx);
```

That child logger automatically carries `requestId`, and can also include `userId` when available.

## Practices

- Prefer small, structured context objects; keep messages human-readable.
- Do not log secrets/PII. `lib/logger.ts` redacts common sensitive fields, but treat that as defense-in-depth, not permission to log secrets.
- When adding new adapters, inject `logger` via constructor/deps instead of importing global singletons.
- Structured logs and Sentry complement each other. Use logs for request-local diagnosis; use Sentry for exception aggregation and client/server telemetry.
