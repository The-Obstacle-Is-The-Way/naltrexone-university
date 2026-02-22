# BS-030: Proxy/Middleware Layer — First-Principles Architecture Analysis

**Date:** 2026-02-22
**Triggered by:** `proxy.ts` flagged as a "P0 auth bypass" in multiple audits (false positives)
**Scope:** Verify whether the proxy/middleware layer is architecturally sound or actually dangerous
**Related:** ADR-004 (Auth Boundary), ADR-009 (Security Hardening), BUG-071, BUG-116, DEBT-197

---

## The Problem

Automated sweeps repeatedly flag auth bypass risk around `proxy.ts`. Current code and build artifacts explain why:

1. The file is `proxy.ts`, but the exported function is still named `middleware`.
2. `.next/server/middleware-manifest.json` is empty (`"middleware": {}`) in Next.js 16 builds.
3. There is no `middleware.ts` file.

These signals can look suspicious to static analyzers even when runtime proxy protection is active.

## What `proxy.ts` Actually Does

`proxy.ts` currently has 88 lines and includes:

- `CLERK_CSP_DIRECTIVES` for Clerk middleware CSP config
- `shouldBypassClerkAuth()` to allow non-production skip mode (`NEXT_PUBLIC_SKIP_CLERK=true`)
- `getClerkMiddleware()` lazy import + singleton cache
- `export default async function middleware(...)` that delegates to Clerk

In the non-bypass path, it runs Clerk's `auth.protect()` on all non-public routes matched by `PUBLIC_ROUTE_PATTERNS`.

## Verified Auth Layers (Defense in Depth)

### Layer 1: Proxy guard (`proxy.ts`)

- Entry: `proxy.ts`
- Behavior: delegates unauthenticated handling to `auth.protect()` for non-public routes
- Role: request-edge auth guard + CSP integration

### Layer 2: App layout entitlement gate (`app/(app)/app/layout.tsx`)

- Entry: `enforceEntitledAppUser()`
- Behavior: requires authenticated user, checks entitlement, redirects non-entitled users to `/pricing?reason=...`
- Role: route-level entitlement enforcement for `/app/*`

### Layer 3: Server-action guard (`require-entitled-user-id.ts`)

- Entry: `requireEntitledUserId()`
- Behavior: requires authenticated user + entitlement, throws `ApplicationError('UNSUBSCRIBED')` when not entitled
- Role: action-level data/operation protection

This is deliberate defense-in-depth, not accidental duplication.

## Important Reality Check: Intentional Bypasses Exist

Not every route uses all three layers.

The following public entry points intentionally bypass this chain:

- Marketing/public pages: `/`, `/pricing`, `/sign-in`, `/sign-up`, `/checkout/success`
- Public API endpoints: `/api/health`, `/api/stripe/webhook`, `/api/webhooks/clerk`, `/api/cron/reconcile-stripe-subscriptions`

So the accurate claim is:

- Layout + server-action guards protect **entitled app routes and guarded actions**.
- They do **not** protect every route in the app, by design.

## Build and Manifest Findings (Verified)

- `pnpm build` currently prints `ƒ Proxy (Middleware)`.
- `.next/server/middleware-manifest.json` remains empty (`"middleware": {}`).
- No `middleware.ts` file exists.

These can all be true at once in Next.js 16.

## Architecture Verdict

- **Architecture:** Sound (layered, explicit, defense-in-depth)
- **Main issue:** Naming mismatch (`function middleware` in `proxy.ts`) creates recurring audit noise
- **Secondary complexity:** SKIP_CLERK bypass + lazy import/cache logic adds cognitive overhead but is understandable

## Severity Assessment

| Issue | Severity | Impact |
|-------|----------|--------|
| Exported function named `middleware` in `proxy.ts` | P4 (code smell) | Triggers recurring false positives; no runtime breakage |
| Empty middleware-manifest interpretation | P4 (tooling ambiguity) | Can mislead automated sweeps |
| Three-layer auth model | Not an issue | Intentional defense-in-depth |
| Public-route bypasses | Not an issue | Intentional product behavior; routes are explicitly whitelisted |

## Proposed Fix (Minimum)

Rename the default export to match current Next.js naming convention:

```diff
- export default async function middleware(
+ export default async function proxy(
    request: NextRequest,
    event: NextFetchEvent,
  ) {
```

This is cosmetic for runtime behavior, but removes the strongest source of false-positive reports.

## Open Questions

1. Rename manually or run `middleware-to-proxy` codemod?
2. Keep lazy import + cache as-is, or simplify if Clerk internals make cache redundant?
3. Should the SKIP_CLERK path have additional observability/alerts in non-production?

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-22 | Architecture is sound; false positives stem from naming/tooling ambiguity | Verified against current proxy/layout/controller flow and build artifacts |
| 2026-02-22 | Recommend renaming `function middleware` to `function proxy` | Aligns with convention and reduces recurring audit noise |
