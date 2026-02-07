# BUG-080: Vercel Environment Variable & Deployment Protection Issues

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-06
**Resolved:** 2026-02-06

---

## Description

During end-to-end verification of the Preview deployment (after BUG-079 fixes), **three additional distinct failures** surfaced sequentially. Each had a different root cause, all related to Vercel environment configuration rather than application code.

The dev branch deployment at `naltrexone-university-git-dev-john-h-jungs-projects.vercel.app` was used for testing.

### Symptoms Observed

**Symptom 1: Clerk webhook returns 401 (not our handler's 400)**
```
POST /api/webhooks/clerk → 401 (Vercel SSO redirect HTML)
```
Three Clerk webhook deliveries returned 401 on Preview. Our webhook handler returns 400 for invalid signatures and never returns 401 — the 401 came from Vercel itself.

**Symptom 2: Stripe checkout `INTERNAL_ERROR` — StripeConnectionError**
```json
{
  "level": 50,
  "plan": "monthly",
  "errorCode": "INTERNAL_ERROR",
  "errorMessage": "Internal error",
  "msg": "Stripe checkout failed"
}
```
Idempotency key logged: `"An error occurred with our connection to Stripe. Request was retried 2 times."`

This was a `StripeConnectionError` (HTTP transport failure), not a Stripe API error.

**Symptom 3: Post-checkout redirect to `localhost:3000` instead of Preview URL**
```
Stripe → http://localhost:3000/checkout/success?session_id=cs_test_...
```
Stripe checkout succeeded (payment processed), but the success redirect landed on `localhost:3000` which is unreachable in the browser.

---

## Root Cause Analysis

### Issue 1: Vercel Deployment Protection Blocking Webhooks

**Root Cause:** Vercel's **Standard Protection** (Deployment Protection → Vercel Authentication) was enabled for the project. This intercepts ALL unauthenticated HTTP requests to Preview deployment URLs and returns a **401 with SSO redirect HTML**.

Server-to-server webhook requests from Clerk and Stripe are unauthenticated by design (they use signature verification, not session cookies). Vercel's protection layer rejects them before they ever reach the Next.js application.

**Confirmed with:**
```bash
curl -X POST "https://naltrexone-university-git-dev-john-h-jungs-projects.vercel.app/api/webhooks/clerk"
# → 401 with Vercel SSO redirect HTML (before fix)
# → 400 "Invalid webhook signature" (after fix — our handler responding correctly)
```

**Fix:** Disabled Vercel Authentication in Project Settings → Deployment Protection. This is acceptable for Preview deployments — they use Clerk Development keys (not production data) and the webhook endpoints have their own signature verification.

**Alternative (not used):** Vercel offers "Protection Bypass for Automation" which allows exempting specific paths. This costs extra and adds complexity for no benefit on Preview deployments.

### Issue 2: Trailing `\n` in Vercel Environment Variables

**Root Cause:** When pasting secret keys into the Vercel dashboard, invisible trailing newline characters (`\n`) were stored as part of the value. This affected **24 variables** across all three Vercel environments (Production, Preview, Development).

The trailing `\n` in `STRIPE_SECRET_KEY` caused Node.js to reject the HTTP `Authorization` header (newlines are illegal in HTTP headers per RFC 7230 §3.2.6), producing a `StripeConnectionError` at the transport layer — before any Stripe API communication occurred.

**Discovery method:** Compared key lengths between local `.env.local` (107 chars) and Vercel Preview (109 chars = 107 + `\n`):
```
Local STRIPE_SECRET_KEY:   107 chars, ends "cXZm5"
Vercel STRIPE_SECRET_KEY:  109 chars, ends "cXZm5\n"
```

**Affected variables (24 total):**

| Environment | Count | Variables |
|-------------|-------|-----------|
| Preview | 7 | STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY, NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL, NEXT_PUBLIC_APP_URL, CRON_SECRET |
| Production | 10 | DATABASE_URL, CLERK_SECRET_KEY, CLERK_WEBHOOK_SIGNING_SECRET, STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY, NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL, NEXT_PUBLIC_APP_URL, CRON_SECRET |
| Development | 7 | Same as Preview |

**Fix:** Re-set all 24 variables using `printf` (which does not append newlines) piped to `vercel env add`:
```bash
printf '%s' "$CLEAN_VALUE" | vercel env add VAR_NAME environment --yes --force
```

**Verification:** Pulled all three environments and confirmed zero trailing whitespace.

### Issue 3: `NEXT_PUBLIC_APP_URL` Set to `localhost:3000` for Preview

**Root Cause:** `NEXT_PUBLIC_APP_URL` for the Preview environment was set to `http://localhost:3000`. This value was used by the billing controller (`src/adapters/controllers/billing-controller.ts:73-75`) to construct Stripe's `success_url` and `cancel_url`.

After Stripe checkout completed, Stripe redirected the browser to `http://localhost:3000/checkout/success?session_id=...`, which is unreachable from a browser testing against the Vercel Preview URL.

**Fix:** Set `NEXT_PUBLIC_APP_URL` for Preview to the stable branch URL:
```
https://naltrexone-university-git-dev-john-h-jungs-projects.vercel.app
```

**Important caveat — `NEXT_PUBLIC_*` and build cache:**

`NEXT_PUBLIC_*` variables are inlined at build time by Next.js's webpack DefinePlugin. Changing the Vercel env var is necessary but not sufficient — a **fresh build** is required.

`vercel redeploy` reuses the build cache, which means stale `NEXT_PUBLIC_*` values persist. We confirmed this: `vercel redeploy` after fixing env vars still served the old `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_live_*` instead of `pk_test_*`), causing: `"Clerk: Production Keys are only allowed for domain addictionboards.com"`.

The reliable fix is to push a commit (even `git commit --allow-empty`) to trigger a fresh GitHub-linked build, which reads the current env vars during the build step.

---

## All Fixes Applied (2026-02-06)

| Issue | Fix | Status |
|-------|-----|--------|
| Vercel Deployment Protection blocking webhooks | Disabled Vercel Authentication for Preview | Resolved |
| Trailing `\n` in 24 Vercel env vars | Re-set all vars with `printf '%s'` pipe | Resolved |
| `NEXT_PUBLIC_APP_URL` = `localhost:3000` on Preview | Set to stable branch URL | Resolved |
| `vercel redeploy` serves stale `NEXT_PUBLIC_*` | Pushed empty commit for fresh build | Resolved |

---

## Prevention

### Trailing Newline Prevention

When setting Vercel env vars via the dashboard:
1. **Always verify** after pasting: pull the value back and check its length
2. **Prefer CLI** for setting secrets: `printf '%s' "value" | vercel env add NAME env --yes --force`
3. **Never use `echo`** — `echo` appends `\n` by default. Use `printf '%s'` instead.

### `NEXT_PUBLIC_*` Build-Time Gotchas

1. Changing a `NEXT_PUBLIC_*` var in Vercel requires a **new build**, not just a redeploy
2. `vercel redeploy` reuses build cache — stale `NEXT_PUBLIC_*` values persist
3. Push a commit (even empty) to trigger a fresh GitHub-linked build
4. Verify by checking the running app, not just `vercel env pull`

### Vercel Deployment Protection

1. Disable Standard Protection for projects that receive server-to-server webhooks on Preview URLs
2. Alternatively, use Vercel's "Protection Bypass for Automation" header
3. Production deployments on custom domains are NOT affected by Deployment Protection

---

## Verification

- [x] Vercel Deployment Protection disabled — webhooks return 400 (our handler), not 401
- [x] All 24 env vars re-set without trailing `\n` across Production, Preview, Development
- [x] `NEXT_PUBLIC_APP_URL` for Preview = `https://naltrexone-university-git-dev-john-h-jungs-projects.vercel.app`
- [x] `NEXT_PUBLIC_APP_URL` for Production = `https://addictionboards.com`
- [x] Fresh Preview build deployed and serving correct env vars
- [x] End-to-end checkout flow on Preview: Sign in → Pricing → Subscribe Monthly → Stripe test card → Subscription active → Full app access

---

## Related

- [BUG-079](bug-079-preview-dev-environment-verification-failures.md) — Predecessor: Preview verification failures (same day), different root causes
- [BUG-078](bug-078-clerk-production-google-oauth-not-configured.md) — Production auth setup
- `docs/dev/deployment-environments.md` — Environment configuration SSOT
- `src/adapters/controllers/billing-controller.ts:73-75` — `toSuccessUrl()` uses `NEXT_PUBLIC_APP_URL`
- `lib/env.ts` — Environment validation
- `lib/container/controllers.ts:52` — `appUrl: primitives.env.NEXT_PUBLIC_APP_URL`
