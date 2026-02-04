# Logging

## Source of truth

- Implementation: `lib/logger.ts` (Pino)
- Adapter contract: `src/application/ports/logger.ts`

## Adapter logger contract

Adapters (controllers, gateways, repositories) depend on a minimal `Logger` interface:

- Methods: `debug`, `info`, `warn`, `error`
- Signature: `(context, message)`

This matches Pino’s native API so log fields stay structured:

```ts
logger.warn({ userId, attempt }, 'Retrying external API call');
logger.error({ error, eventId }, 'Stripe webhook failed');
```

## Practices

- Prefer small, structured context objects; keep messages human-readable.
- Do not log secrets/PII. `lib/logger.ts` redacts common sensitive fields, but treat that as defense-in-depth, not permission to log secrets.
- When adding new adapters, inject `logger` via constructor/deps instead of importing global singletons.
