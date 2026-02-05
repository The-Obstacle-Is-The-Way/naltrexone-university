# DEBT-101: Add Sentry Error Tracking (Next.js, Free Tier)

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-04
**Resolved:** 2026-02-05

---

## Description

The app currently relies on:
- `console.error` in error boundaries, and
- structured logs (`lib/logger.ts`)

…but there is no error aggregation with grouping, stack traces, user impact, or alerting. For production, we should add a first-class error tracking service.

Sentry’s free-tier plan is sufficient for MVP.

---

## Resolution

### 1) Add the SDK

Install:

```bash
pnpm add @sentry/nextjs
```

Then configure **without committing secrets**.

Recommended approach (minimal, explicit):

- Create `sentry.client.config.ts` to initialize the browser SDK.
- Import `sentry.client.config.ts` from `instrumentation-client.ts` so the browser SDK initializes without modifying `next.config.ts`.
- Initialize server/edge in `instrumentation.ts` by calling `Sentry.init({ ... })` inside `register()`.
- Implement Next.js `onRequestError` hook via `Sentry.captureRequestError` (required for Next 15+ to capture request-time errors reliably).
- Optionally add source map upload later (requires `SENTRY_AUTH_TOKEN` in CI only).

**Note (SDK behavior):** In `@sentry/nextjs` v10+, `sentry.server.config.ts` and `sentry.edge.config.ts` are considered legacy and the SDK will warn if they exist. Prefer `instrumentation.ts` for server/edge initialization.

Alternative approach (wizard):

```bash
npx @sentry/wizard@latest -i nextjs
```

If using the wizard, review every generated change for:
- secrets accidentally written to disk (do not commit),
- Next config changes (source maps), and
- any telemetry prompts (choose appropriately).

### 2) Environment variables (do not commit real values)

`.env.example` already includes placeholders:

- `NEXT_PUBLIC_SENTRY_DSN` (public, ok to expose to client; still don’t commit real DSN)
- `SENTRY_DSN` (server; optional if using the public DSN everywhere)

For source maps (optional, later):
- `SENTRY_AUTH_TOKEN` (secret; CI/Vercel only)
- `SENTRY_ORG`
- `SENTRY_PROJECT`

**Never commit**:
- `.env`, `.env.local`, `.env.production`, `.env.*.local`
- auth tokens

### 3) Safe defaults / privacy

- Only enable event sending in production (and optionally preview).
- Avoid sending PII by default:
  - Prefer `Sentry.setUser({ id: userId })` (internal UUID), not email.
  - Do not attach request bodies, Clerk tokens, or Stripe signatures.

### 4) Verification checklist

Local (no data sent):
- [ ] App boots with no Sentry DSN set.
- [ ] App boots with a dummy DSN and Sentry disabled locally.

Production/Preview (data sent):
- [ ] A forced error in a server route appears in Sentry with stack trace.
- [ ] A forced error in a client component appears in Sentry with stack trace.
- [ ] Error boundary UI still renders correctly.
- [ ] No secrets/PII appear in Sentry event payloads.

---

## Related

- `docs/specs/spec-016-observability.md`
- `docs/debt/debt-100-adversarial-audit-2026-02-04.md`
