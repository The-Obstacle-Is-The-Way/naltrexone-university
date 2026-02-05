# Clerk Vendor Documentation

**Package:** `@clerk/nextjs` ^6.37.1
**API Version:** `2024-10-01`
**Dashboard:** https://dashboard.clerk.com
**Docs:** https://clerk.com/docs
**Changelog:** https://clerk.com/changelog

---

## API Version

Clerk uses date-based API versioning. Specify via:
- Header: `Clerk-API-Version: 2024-10-01`
- Query param: `?__clerk_api_version=2024-10-01`

**Current version:** `2024-10-01`

**SDK release cycle:** ~6 months for major releases with potential breaking changes.

---

## Fields We Depend On

### User Object

| Field | Used In | Notes |
|-------|---------|-------|
| `id` | Auth gateway, user sync | Clerk user ID (`user_xxx`) |
| `primaryEmailAddress.emailAddress` | User sync | Email for notifications |
| `publicMetadata` | Not used | Could store app-specific data |
| `privateMetadata` | Not used | Server-only metadata |

### Session Object

| Field | Used In | Notes |
|-------|---------|-------|
| `userId` | All auth checks | Current user ID |
| `sessionClaims` | Auth gateway | Custom claims from JWT |

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

**Public routes** (from `lib/public-routes.ts`):
- `/`, `/pricing(.*)`, `/sign-in(.*)`, `/sign-up(.*)`
- `/checkout/success(.*)`, `/api/health(.*)`
- `/api/stripe/webhook(.*)`, `/api/webhooks/clerk(.*)`

---

## Content Security Policy (CSP)

We generate CSP headers via **Clerk middleware**, not `next.config.ts`.

**Why:**
- Next.js requires inline scripts for runtime bootstrapping unless you implement a nonce/hash strategy.
- Clerk + Stripe require specific CSP allowances (e.g., `worker-src blob:` and Stripe frames).
- Static CSP in `next.config.ts` is brittle and can conflict with Clerk’s requirements.

### Current Implementation

In `proxy.ts`, we pass `contentSecurityPolicy` options to `clerkMiddleware()` so Clerk emits a Clerk + Stripe compatible CSP header, and we merge in app-specific directives (e.g., `base-uri`, `frame-ancestors`, `object-src`, expanded `img-src`).

### Strict / Nonce Mode (Optional)

Clerk supports a stricter mode (`contentSecurityPolicy: { strict: true }`) that adds a per-request nonce via the `X-Nonce` header.

If enabling strict CSP, ensure the app is compatible with nonce-based script loading and follow Clerk + Next.js CSP documentation closely before shipping.

### Server Components

```typescript
import { auth } from '@clerk/nextjs/server';

export default async function Page() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
}
```

### Client Components

```typescript
'use client';
import { useUser, useAuth } from '@clerk/nextjs';

function Component() {
  const { user } = useUser();
  const { userId, isLoaded } = useAuth();
}
```

---

## Webhooks We Handle

| Event | Handler | Purpose |
|-------|---------|---------|
| `user.updated` | `/api/webhooks/clerk` | Sync user data (email changes) |
| `user.deleted` | `/api/webhooks/clerk` | Cancel Stripe subscriptions, delete user data |

**Note:** We do NOT handle `user.created`. Users are created lazily on first authenticated request.

**Webhook endpoint:** `/api/webhooks/clerk`

**Webhook secret:** `CLERK_WEBHOOK_SIGNING_SECRET` env var

**Signature verification:** Uses `@clerk/nextjs/webhooks` `verifyWebhook()` function.

---

## Breaking Changes to Watch

### Session Token V2 (Recent)

Clerk added support for session token version 2. If using custom JWT claims, verify they still work after SDK upgrades.

### SAML/SSO Changes

For sign-ins matching a SAML connection, API now returns `needs_first_factor` status instead of `needs_identifier`. Only affects enterprise SSO implementations (we don't use this).

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Client-side auth | Yes |
| `CLERK_SECRET_KEY` | Server-side auth | Yes |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Webhook verification | Yes |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Custom sign-in route | Optional |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Custom sign-up route | Optional |

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
