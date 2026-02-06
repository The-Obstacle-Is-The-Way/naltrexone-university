# BUG-078: Clerk Production Sign-In Broken (Google OAuth Not Configured + Domain Lock)

**Status:** Resolved
**Priority:** P0
**Date:** 2026-02-06
**Resolved:** 2026-02-06

---

## Description

Production sign-in was completely broken on both access points:

1. **`addictionboards.com`**: Clicking "Sign in with Google" showed `Access blocked: Authorization Error — Missing required parameter: client_id`
2. **`*.vercel.app` (Production alternate URL)**: Sign-in page rendered a blank screen with console error: `Production Keys are only allowed for domain "addictionboards.com"`

No users could authenticate on Production.

### Console Errors Observed

```
clerk.addictionboards.com/v1/client: 400

Clerk: Production Keys are only allowed for domain "addictionboards.com".
API Error: The Request HTTP Origin header must be equal to or a subdomain of the requesting URL.
```

```
Google OAuth: Missing required parameter: client_id
Error 400: invalid_request
```

```
ApplicationError: User could not be upserted due to a uniqueness constraint
code: 'CONFLICT', digest: '145039054'
```

---

## Root Cause

**This was NOT a code regression.** No auth-related code (`proxy.ts`, `next.config.ts`, `lib/env.ts`) changed in the last 5 commits.

The root cause was **incomplete Clerk Production instance setup** from BUG-066 (2026-02-05). The Production Clerk instance was created and live keys were set in Vercel, but four critical configuration steps were missed:

1. **Google OAuth Social Connection** — no `client_id` / `client_secret` configured
2. **Component Paths** — set to Account Portal instead of application domain (embedded `<SignIn />` / `<SignUp />` components)
3. **Webhook endpoint** — not configured (user sync to database never happened)
4. **Stale Development user data** — database had user rows with Development Clerk IDs; Production Clerk IDs for the same emails hit uniqueness constraints

### Four Distinct Failures (Discovered Sequentially)

| # | Symptom | Cause | Fix |
|---|---------|-------|-----|
| 1 | Google OAuth `client_id` missing | Clerk Production SSO → Google not configured | Added Google OAuth credentials from Google Cloud Console |
| 2 | Blank page after Paths change / Account Portal mismatch | Component Paths pointed to Account Portal instead of app's embedded components | Switched to "application domain" with `/sign-in`, `/sign-up` paths |
| 3 | "Something went wrong" error after OAuth | Webhook endpoint missing → user not synced to database | Created webhook endpoint for `user.created`, `user.updated`, `user.deleted`; updated `CLERK_WEBHOOK_SIGNING_SECRET` in Vercel |
| 4 | `CONFLICT` error on user upsert | Development Clerk user IDs in database conflicted with Production Clerk IDs for same email | Wiped stale Development user data from database |

### Timeline

1. Before 2026-02-05: Production used Clerk Development keys (`pk_test_*`) — worked but showed "Development mode" badge
2. 2026-02-05 (BUG-066): Created Clerk Production instance, set `pk_live_*`/`sk_live_*` in Vercel Production env vars
3. 2026-02-05: Verification left incomplete — Google OAuth, Paths, webhook, and database cleanup not done
4. 2026-02-06: User attempts sign-in → all four failures surface sequentially
5. 2026-02-06: All four fixes applied → Production sign-in working

---

## Fix (All Applied 2026-02-06)

### Fix 1: Configure Google OAuth in Production Clerk

1. Clerk Dashboard → Production → SSO Connections → Google
2. Created "Addiction Boards Production" OAuth client in Google Cloud Console
3. Added `client_id` and `client_secret` to Clerk
4. Published Google OAuth app (moved from "Testing" to "In production")
5. Authorized redirect URI: `https://clerk.addictionboards.com/v1/oauth_callback`

### Fix 2: Set Component Paths to Application Domain

1. Clerk Dashboard → Production → Developers → Paths
2. Changed `<SignIn />` from Account Portal to application domain: `addictionboards.com/sign-in`
3. Changed `<SignUp />` from Account Portal to application domain: `addictionboards.com/sign-up`
4. Changed Signing Out to application domain: `addictionboards.com/sign-in`

### Fix 3: Configure Clerk Webhook Endpoint

1. Clerk Dashboard → Production → Developers → Webhooks → Add Endpoint
2. URL: `https://addictionboards.com/api/webhooks/clerk`
3. Events: `user.created`, `user.updated`, `user.deleted`
4. Copied signing secret → updated `CLERK_WEBHOOK_SIGNING_SECRET` in Vercel Production via `vercel env add --force`

### Fix 4: Clean Stale Development Data from Database

1. Wiped all user-related rows (users, attempts, bookmarks, practice_sessions, stripe_customers, stripe_events, stripe_subscriptions)
2. Preserved question content (958 questions, choices, tags)
3. Deleted stale user from Clerk Production → Users

### Vercel Alternate URL (EXPECTED BEHAVIOR)

The `*.vercel.app` URL showing a blank screen with Production keys is **expected behavior** — Clerk Production keys are domain-locked. Access Production only via `addictionboards.com`. Use Preview deployments with Clerk Development keys for testing.

---

## Verification

- [x] `addictionboards.com` → "Sign up with Google" → completes OAuth flow successfully
- [x] `addictionboards.com` → Dashboard renders with user stats
- [x] `addictionboards.com` → sign-in page has no "Development mode" badge
- [x] Console has no Clerk development key warnings on `addictionboards.com`
- [x] Webhook endpoint configured and signing secret set in Vercel
- [ ] Vercel Preview deployments (non-main branches) still work with Clerk Development keys

---

## Prevention

### Clerk Production Setup Checklist (for `docs/dev/deployment-environments.md`)

When setting up a new Clerk Production instance, ALL of these must be completed:

1. Create Clerk Production instance
2. Set domain to `addictionboards.com`
3. Verify DNS records (Frontend API, Account Portal, Email DKIM)
4. Configure ALL Social Connections (Google, Apple) with Production OAuth credentials
5. Set Component Paths to application domain (`/sign-in`, `/sign-up`)
6. Create webhook endpoint (`https://addictionboards.com/api/webhooks/clerk`) for `user.created`, `user.updated`, `user.deleted`
7. Set all env vars in Vercel Production: `pk_live_*`, `sk_live_*`, `CLERK_WEBHOOK_SIGNING_SECRET`
8. Wipe any stale Development user data from the database
9. **Test end-to-end sign-up AND sign-in on Production** (do not skip this step)

---

## Related

- [BUG-066](../_archive/bugs/bug-066-clerk-development-keys-in-production.md) — Predecessor: switched to Production keys but didn't complete verification
- [BUG-071](../_archive/bugs/bug-071-nextjs-preview-blank-page-csp.md) — Previous blank screen issue (CSP-related, different root cause)
- `docs/dev/deployment-environments.md` — Environment key mapping documentation
- `proxy.ts` — Clerk middleware (NOT modified, not the cause)
- `lib/env.ts` — Environment validation (NOT modified, not the cause)
