# ~~BUG-203~~ → INVALIDATED: `whsec_dummy` Fallback Is Not Used by Clerk Webhook Verification

**Created:** 2026-03-10
**Source:** Audit #13
**Status:** Invalidated (2026-03-10)
**Reason:** The installed Clerk runtime reads `process.env.CLERK_WEBHOOK_SIGNING_SECRET` directly inside `verifyWebhook()`. Our typed `env` fallback in `lib/env.ts` never mutates `process.env`, so the `whsec_dummy` string is not a live verifier secret for `/api/webhooks/clerk`.

---

## What Was Verified

### The app route does not pass our typed fallback into Clerk

The route simply forwards the request:

```typescript
return verifyWebhook(req as unknown as ClerkRequestLike);
```

There is no `signingSecret` argument, and no use of `env.CLERK_WEBHOOK_SIGNING_SECRET`.

### `@clerk/nextjs` forwards to `@clerk/backend`

Installed runtime at [node_modules/.pnpm/@clerk+nextjs@6.37.1_next@16.1.6_@babel+core@7.29.0_@opentelemetry+api@1.9.0_@playwrigh_6efdc9384cdd89288039aac9aa09ecc4/node_modules/@clerk/nextjs/dist/cjs/webhooks.js#L31](/Users/ray/Desktop/github/naltrexone-university/node_modules/.pnpm/@clerk+nextjs@6.37.1_next@16.1.6_@babel+core@7.29.0_@opentelemetry+api@1.9.0_@playwrigh_6efdc9384cdd89288039aac9aa09ecc4/node_modules/@clerk/nextjs/dist/cjs/webhooks.js#L31):

```typescript
async function verifyWebhook(request, options) {
  return import_webhooks.verifyWebhook(request, options);
}
```

### `@clerk/backend` reads `process.env`, not our `env` object

Installed runtime at [node_modules/.pnpm/@clerk+backend@2.30.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/@clerk/backend/dist/webhooks.js#L62](/Users/ray/Desktop/github/naltrexone-university/node_modules/.pnpm/@clerk+backend@2.30.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/@clerk/backend/dist/webhooks.js#L62):

```typescript
const secret =
  options.signingSecret ??
  getEnvVariable("CLERK_WEBHOOK_SIGNING_SECRET");
if (!secret) {
  return errorThrower.throw("Missing webhook signing secret...");
}
```

If `process.env.CLERK_WEBHOOK_SIGNING_SECRET` is unset, verification fails before any payload is trusted.

### `lib/env.ts` does not populate `process.env`

`lib/env.ts` returns a typed object with:

```typescript
CLERK_WEBHOOK_SIGNING_SECRET:
  parsed.data.CLERK_WEBHOOK_SIGNING_SECRET ?? 'whsec_dummy',
```

but that assignment only affects the exported `env` value, not `process.env`.

Repository-wide search found only one non-test reference outside `lib/env.ts`:

- [lib/logger.ts#L40](/Users/ray/Desktop/github/naltrexone-university/lib/logger.ts#L40) — string path for redaction config

There is no production path that passes `env.CLERK_WEBHOOK_SIGNING_SECRET` into Clerk's verifier.

### The route fails closed when the real env var is missing

The handler catches verification failure at [app/api/webhooks/clerk/handler.ts#L87](/Users/ray/Desktop/github/naltrexone-university/app/api/webhooks/clerk/handler.ts#L87) and returns `400`:

```typescript
event = await verifyWebhook(req);
...
return NextResponse.json(
  { error: 'Invalid webhook signature' },
  { status: 400 },
);
```

So the original claim:

> missing Clerk webhook secret causes `/api/webhooks/clerk` to verify against `whsec_dummy`

is not true in the current runtime.

---

## Residual Note

The fallback in `lib/env.ts` is still misleading and worth cleanup as debt, because it suggests a security-relevant default that the runtime does not actually use. Today, though, that is configuration confusion, not a live webhook-auth bypass.
