# BUG-078: Clerk Production Sign-In Broken (Google OAuth Not Configured + Domain Lock)

**Status:** Open
**Priority:** P0
**Date:** 2026-02-06

---

## Description

Production sign-in is completely broken on both access points:

1. **`addictionboards.com`**: Clicking "Sign in with Google" shows `Access blocked: Authorization Error — Missing required parameter: client_id`
2. **`*.vercel.app` (Production alternate URL)**: Sign-in page renders a blank screen with console error: `Production Keys are only allowed for domain "addictionboards.com"`

No users can authenticate on Production.

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

---

## Root Cause

**This is NOT a code regression.** No auth-related code (`proxy.ts`, `next.config.ts`, `lib/env.ts`) has changed in the last 5 commits.

The root cause is **incomplete Clerk Production instance setup** from BUG-066 (2026-02-05). The Production Clerk instance was created and live keys were set in Vercel, but:

1. **Google OAuth Social Connection** was never configured in the Production Clerk instance — no Google `client_id` / `client_secret` was added
2. **BUG-066 verification was never completed** — the final 2 checkboxes ("no dev badge visible", "no dev key warnings") were left unchecked

### Two Distinct Failures

| Access Point | Symptom | Cause |
|--------------|---------|-------|
| `addictionboards.com` | Google OAuth `client_id` missing | Clerk Production Social Connections → Google not configured |
| `*.vercel.app` | Blank screen (Clerk rejects request) | Clerk Production keys are domain-locked to `addictionboards.com`; alternate Vercel URLs don't match |

### Timeline

1. Before 2026-02-05: Production used Clerk Development keys (`pk_test_*`) — worked but showed "Development mode" badge
2. 2026-02-05 (BUG-066): Created Clerk Production instance, set `pk_live_*`/`sk_live_*` in Vercel Production env vars
3. 2026-02-05: Verification left incomplete — Google OAuth not configured, sign-in never tested end-to-end
4. 2026-02-06: User attempts sign-in → both failures surface

---

## Fix (Manual — Clerk Dashboard)

### Fix 1: Configure Google OAuth in Production Clerk (REQUIRED)

1. Go to **Clerk Dashboard** → select **Production** instance
2. Navigate to **User & Authentication** → **Social Connections**
3. Enable **Google**
4. Add the Google OAuth `client_id` and `client_secret` from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - The OAuth consent screen must list `addictionboards.com` as an authorized domain
   - Authorized redirect URI must include: `https://clerk.addictionboards.com/v1/oauth_callback`
5. Save and test sign-in on `addictionboards.com`

### Fix 2: Verify Clerk Production Redirect URLs (CHECK)

1. Go to **Clerk Dashboard** → **Production** → **Paths**
2. Confirm these are set:
   - Sign-in URL: `/sign-in`
   - Sign-up URL: `/sign-up`
   - After sign-in URL: `/app/practice`
   - After sign-up URL: `/app/practice`
3. Go to **Domains** → confirm `addictionboards.com` is the primary domain

### Fix 3: Vercel Alternate URL (EXPECTED BEHAVIOR)

The `*.vercel.app` URL showing a blank screen with Production keys is **expected behavior** — Clerk Production keys are domain-locked. This is not a bug. Access Production only via `addictionboards.com`.

If you need to test on Vercel URLs, use a **Preview deployment** (any non-`main` branch), which should be configured with Clerk Development keys (`pk_test_*`).

---

## Verification

- [ ] `addictionboards.com` → "Sign in with Google" → completes OAuth flow successfully
- [ ] `addictionboards.com` → sign-in page has no "Development mode" badge
- [ ] Console has no Clerk development key warnings on `addictionboards.com`
- [ ] BUG-066 verification checklist fully completed
- [ ] Vercel Preview deployments (non-main branches) still work with Clerk Development keys

---

## Prevention

After this fix, document the complete Clerk Production setup checklist in `docs/dev/deployment-environments.md`:

1. Create Clerk Production instance
2. Set domain to `addictionboards.com`
3. Configure ALL Social Connections (Google, etc.) with Production OAuth credentials
4. Configure redirect URLs
5. Set `pk_live_*` / `sk_live_*` in Vercel Production env vars
6. **Test end-to-end sign-in on Production** (do not skip this step)

---

## Related

- [BUG-066](../_archive/bugs/bug-066-clerk-development-keys-in-production.md) — Predecessor: switched to Production keys but didn't complete verification
- [BUG-071](../_archive/bugs/bug-071-nextjs-preview-blank-page-csp.md) — Previous blank screen issue (CSP-related, different root cause)
- `docs/dev/deployment-environments.md` — Environment key mapping documentation
- `proxy.ts` — Clerk middleware (NOT modified, not the cause)
- `lib/env.ts` — Environment validation (NOT modified, not the cause)
