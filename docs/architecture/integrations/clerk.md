# Clerk Vendor Documentation

**Package:** `@clerk/nextjs` (version: `package.json`)
**API Version:** chosen by `@clerk/backend` (`SUPPORTED_BAPI_VERSION`); not pinned in code
**Dashboard:** https://dashboard.clerk.com
**Docs:** https://clerk.com/docs
**Changelog:** https://clerk.com/changelog

**Upgrade history:** upgraded from v6 (Core 2) to v7 (Core 3) with the `@clerk/upgrade` CLI on 2026-03-28.
Clerk API-version tracking remains vendor-managed rather than pinned in local
runtime code.

---

## API Version

Clerk uses date-based API versioning. Specify via:
- Header: `Clerk-API-Version: <date>`
- Query param: `?__clerk_api_version=<date>`

The app sets neither. `@clerk/backend` sends the version it supports (`SUPPORTED_BAPI_VERSION` in its build), so a Clerk SDK upgrade can move it: read the SDK's changelog for API-version changes when upgrading.

**SDK release cycle:** ~6 months for major releases with potential breaking changes.

---

## Fields We Depend On

### User Object

| Field | Used In | Notes |
|-------|---------|-------|
| `id` | Auth gateway, user sync | Clerk user ID (`user_xxx`) |
| `primaryEmailAddressId` | Auth gateway | Matched against `emailAddresses[].id` to find primary email |
| `emailAddresses[]` | Auth gateway | Array of `{ id, emailAddress }` — fallback to `[0]` if no primary |
| `updatedAt` / `updated_at` | Auth gateway | Used as `observedAt` for user upsert staleness tracking |
| `publicMetadata` | Not used | Could store app-specific data |
| `privateMetadata` | Not used | Server-only metadata |

### Session Object

| Field | Used In | Notes |
|-------|---------|-------|
| `userId` | All auth checks (via `auth()`) | Current user ID |

---

## Auth Patterns

### Middleware (proxy.ts)

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { PUBLIC_ROUTE_PATTERNS } from '@/lib/public-routes';

const isPublicRoute = createRouteMatcher(PUBLIC_ROUTE_PATTERNS);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});
```

**Public routes** are listed in `PUBLIC_ROUTE_PATTERNS` (`lib/public-routes.ts`); every other route is protected. `/checkout/success` is protected on purpose: Clerk restores the session after Stripe's redirect, and `session_id` must survive Clerk's sign-in and handshake redirects (DEBT-249).

---

## Content Security Policy (CSP)

We generate CSP headers via **Clerk middleware**, not `next.config.ts`.

**Why:**
- Next.js requires inline scripts for runtime bootstrapping unless you implement a nonce/hash strategy.
- Clerk requires specific CSP allowances (e.g., `worker-src blob:`).
- Static CSP in `next.config.ts` is brittle and can conflict with Clerk’s requirements.

### Current Implementation

In `proxy.ts`, we pass `contentSecurityPolicy` options to `clerkMiddleware()` so Clerk emits a Clerk + Stripe compatible CSP header, and we merge in app-specific directives (e.g., `base-uri`, `frame-ancestors`, `object-src`, expanded `img-src`).

We run in **strict report-only** mode (`{ strict: true, reportOnly: true }`) with per-request nonce plumbing:
- `proxy.ts` sets `strict: true` + `reportOnly: true` in `clerkMiddleware()` CSP config
- `app/layout.tsx` reads the nonce via `headers()` and passes it to `<Providers nonce={nonce}>`
- Sentry CSP reporting is wired via `reportTo` and `report-uri` when the endpoint is configured

**Current posture:** Strict CSP is active but in **report-only** mode — violations are reported to the configured reporting endpoint (Sentry when enabled), but not blocked. DEBT-420 records the current decision: do **not** enforce Clerk strict nonce CSP on this stack because Next 16 PPR/Cache Components serve prerendered shell scripts without the per-request nonce; if enforcement is prioritized later, use a separate non-nonce host-allowlist CSP design.

Our directives are merged into Clerk's defaults: they can add sources but never remove one. Billing redirects to Stripe-hosted pages and loads no Stripe.js, so the policy needs no Stripe hosts; adding Stripe.js, Elements or embedded Checkout means revisiting it. Before any enforcing policy, check `form-action` against the billing redirects (DEBT-332).

### Server Components

```typescript
import { auth } from '@clerk/nextjs/server';

export default async function Page() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
}
```

### Client Components

We use Clerk's prebuilt components (`<SignIn />`, `<SignUp />`, `<UserButton />`) and do **not** use `useUser()`, `useAuth()`, or other Clerk client hooks directly. `SignIn` and `SignUp` are loaded via `next/dynamic(..., { ssr: false })`; `UserButton` is imported inside the async `AuthNav` server component and rendered there.

---

## REST API (Backend)

For server-side operations outside Next.js (e.g., E2E test seeding), use the Clerk REST API directly instead of `@clerk/nextjs/server`. This avoids the `server-only` import restriction.

**User lookup by email** (used in `tests/e2e/helpers/seed-test-user.ts`):
```typescript
const res = await fetch(
  `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`,
  { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } },
);
const [user] = await res.json();
// user.id = "user_xxx"
```

**Docs:** https://clerk.com/docs/reference/backend-api

**Note:** The `CLERK_SECRET_KEY` (`sk_test_*` / `sk_live_*`) works as a Bearer token for all Backend API endpoints.

---

## Webhooks We Handle

| Event | Handler | Purpose |
|-------|---------|---------|
| `user.updated` | `/api/webhooks/clerk` | Sync user data (email changes). Since DEBT-503 item 1, this is how a signed-in user's stored email stays current; checkout and trial card setup also refresh it. To recover a missed update, replay the event from the Clerk Dashboard. |
| `user.deleted` | `/api/webhooks/clerk` | Delete user data, then the Stripe customer, which cancels its subscriptions |

**Note:** We do NOT handle `user.created`. Users are created lazily on first authenticated request. After that, a request reads the row by Clerk ID with no Backend API call, unless it needs the current email: checkout and trial card setup still refresh it from Clerk (DEBT-503 item 1).

**Webhook endpoint:** `/api/webhooks/clerk`

**Webhook secret:** `CLERK_WEBHOOK_SIGNING_SECRET` env var

**Signature verification:** Uses `@clerk/nextjs/webhooks` `verifyWebhook()` function.
Because `app/api/webhooks/clerk/route.ts` always calls `verifyWebhook()`, any environment that receives real Clerk webhook deliveries needs a real `CLERK_WEBHOOK_SIGNING_SECRET`, regardless of hosting platform. `lib/env.ts` only hard-fails a missing secret on Vercel production deploys; other environments may omit it only when webhook delivery is intentionally not exercised there.

---

## Breaking Changes to Watch

### Session Token V2 (Recent)

Clerk added support for session token version 2. If using custom JWT claims, verify they still work after SDK upgrades.

### Clerk JS Loads Unpinned From Clerk's CDN

The browser half of sign-in is not part of the app's build. `<ClerkProvider>` loads Clerk JS and its UI bundle from Clerk's servers at the latest 6.x and 1.x, because `NEXT_PUBLIC_CLERK_JS_VERSION` and `NEXT_PUBLIC_CLERK_UI_VERSION` are unset. A Clerk release therefore reaches every visitor without a deploy of the app.

**If sign-in breaks and the app was not deployed, check Clerk's recent releases first** (the changelog above, and the `@clerk/clerk-js` and `@clerk/ui` versions on npm, since Clerk releases the UI separately). Rolling back to a deployment on the same `@clerk/nextjs` major does not change the versions visitors load, because that major always asks for the latest release of one Clerk JS major and one UI major (`@clerk/nextjs` 7 asks for Clerk JS 6 and UI 1). Only a rollback across a `@clerk/nextjs` major changes it. Whether to pin the versions is DEBT-521.

### SAML/SSO Changes

For sign-ins matching a SAML connection, API now returns `needs_first_factor` status instead of `needs_identifier`. Only affects enterprise SSO implementations (we don't use this).

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Client-side auth | Yes unless `NEXT_PUBLIC_SKIP_CLERK=true` |
| `CLERK_SECRET_KEY` | Server-side auth + Backend API | Yes unless `NEXT_PUBLIC_SKIP_CLERK=true` |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Webhook verification | Required in any environment where `/api/webhooks/clerk` receives Clerk webhooks |
| `NEXT_PUBLIC_SKIP_CLERK` | Local/CI bypass for Clerk middleware + provider validation | Optional; must be false/absent in production |

---

## Key Mismatch Warning

If you see "Clerk: The `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` does not match the key configured in your Clerk Dashboard", it means:
- Development keys used in production (or vice versa)
- Keys from different Clerk applications mixed

**Fix:** Ensure all Clerk env vars are from the same application and environment.

See: BUG-040 (archived)

---

## Upgrade Checklist

When upgrading `@clerk/nextjs`:

- [ ] Read [changelog](https://clerk.com/changelog) for breaking changes
- [ ] Check [upgrade guides](https://clerk.com/docs/guides/development/upgrading/overview)
- [ ] Test sign-in/sign-up flows
- [ ] Test protected routes
- [ ] Test webhook delivery
- [ ] Update this doc with new version

---

## Sources

- [Clerk Versioning](https://clerk.com/docs/guides/development/upgrading/versioning)
- [Clerk Changelog](https://clerk.com/changelog)
- [Clerk Next.js Docs](https://clerk.com/docs/quickstarts/nextjs)
- [Available API Versions](https://clerk.com/docs/backend-requests/versioning/available-versions)
