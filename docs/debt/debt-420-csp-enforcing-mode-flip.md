# DEBT-420: Promote Clerk Strict CSP from Report-Only to Enforcing (with `form-action` billing hardening)

**Priority:** P2
**Created:** 2026-06-14
**Status:** Proposed — **documentation only. No code has changed.** This doc exists to be audited *before* any implementation.
**Source:** Owner request to finally close the last open item of DEBT-332; GitHub issue [#245](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/245).
**Parent audit:** [DEBT-332 Security Posture Audit](./debt-332-security-posture-audit.md) — this doc is the **execution decision record** for DEBT-332's last unchecked Definition-of-Done item.
**Related:** [`proxy.ts`](../../proxy.ts), [`proxy.test.ts`](../../proxy.test.ts), the billing redirect flow, issues [#245](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/245) and [#251](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/251).
**Citations verified:** 2026-06-14 against the `debt/420-csp-enforce-flip` branch base (= `dev` tip) @ `8f5c1c24`, independently re-audited by a second agent, and against the installed `@clerk/nextjs@7.4.3` (constraint `^7.4.1` in `package.json`).

---

## TL;DR / Decision

We have run **strict CSP in report-only** in production since ~March 2026 (PR #242) with **zero** reported violations across auth, theme, every authenticated page, and the health endpoint. Turning enforcement on is a **one-line flag flip** in `proxy.ts` (`reportOnly: true` → `false`). It needs **no Vercel/Cloudflare/Clerk dashboard change** — the entire policy is code, owned by the Clerk middleware in `proxy.ts`. It is trivially reversible.

There is exactly **one** path that report-only's clean record does **not** clear: the **`form-action 'self'`** directive (a Clerk default) interacting with our **server-side billing redirects to Stripe**. This is the money path. The decision in this doc is:

> **Pre-authorize the two Stripe redirect hosts in `form-action`, *then* flip to enforcing.** Verified against the installed Clerk SDK, this makes Subscribe and Manage-Billing safe regardless of browser quirks or whether JavaScript is enabled — and only then do we enforce.

No optionality: one path, with rejected alternatives recorded below.

---

## Background: what is deployed today

`proxy.ts` configures Clerk's automatic CSP through `clerkMiddleware(..., { contentSecurityPolicy: ... })`:

```ts
// proxy.ts:205-214 (verbatim)
contentSecurityPolicy: {
  directives: CLERK_CSP_DIRECTIVES,
  strict: true,
  reportOnly: true,          // ← the only thing standing between us and enforcing
  ...(sentrySecurityHeaderEndpoint
    ? { reportTo: sentrySecurityHeaderEndpoint }
    : {}),
},
```

What this emits at runtime, today:

- Header name **`Content-Security-Policy-Report-Only`** (it logs, it does not block).
- `script-src` with a per-request **`'nonce-…'`** + **`'strict-dynamic'`** (strict mode strips the broad `http:`/`https:` script sources — see SDK proof below).
- `report-uri` → Sentry Security Header endpoint, plus `report-to csp-endpoint` and a `Reporting-Endpoints` response header (wired from `NEXT_PUBLIC_SENTRY_DSN` in `proxy.ts:77-85`).
- `x-nonce` response header, threaded through `app/layout.tsx:71` → `Providers` (`components/providers.tsx:67`, `ClerkProvider dynamic`) → `components/theme-provider.tsx:11` (`next-themes`).

Public routes still traverse this middleware (they only skip `auth.protect()`), so the policy applies site-wide. DEBT-332 verified **zero** report-only violations on production (`addictionboards.com`) and the dev preview across sign-in/out (Clerk + Google), theme toggle, protected/paywall routes, and `/api/health`. **Billing checkout/portal was the one flow never exercised end-to-end.**

---

## What "turning it on" actually is

Mechanically verified against the installed SDK at
`node_modules/.pnpm/@clerk+nextjs@7.4.3_.../@clerk/nextjs/dist/esm/server/content-security-policy.js`:

```js
// createContentSecurityPolicyHeaders(...) — lines 172-176
if (options.reportOnly) {
  headers.push([Headers.ContentSecurityPolicyReportOnly, cspHeader]);  // current
} else {
  headers.push([Headers.ContentSecurityPolicy, cspHeader]);            // enforcing
}
```

So `reportOnly: false` swaps the header name from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. **The policy bytes are identical; only enforcement changes.** Reporting is independent of this switch (it comes from `options.reportTo`/the custom `report-uri`, lines 168-171), so **Sentry keeps receiving violation reports in enforcing mode** — exactly the safety net we want during the first weeks of enforcement.

That is the entire change. There is no second system, no dashboard toggle, no env var.

---

## The one real risk: `form-action 'self'` vs. our Stripe redirects

### Clerk's default includes `form-action 'self'`

From the same SDK source, `DEFAULT_DIRECTIVES` (lines 56-88):

```js
"form-action": ["self"],
```

Strict mode modifies **only** `script-src` (lines 139-146: it deletes `http:`/`https:`, adds `'strict-dynamic'` + nonce). It does **not** touch `form-action`. So the emitted header is `form-action 'self'` today, and would remain so under enforcing. DEBT-332's captured production header confirms `form-action 'self';`.

### Our billing is a server-side redirect to an external origin

There are no client-side Stripe.js assets on our pages. (`package.json` has only the server SDK `stripe`, no `@stripe/stripe-js` / `@stripe/react-stripe-js`; `lib/stripe.ts` is `import 'server-only'`. A naive grep for `loadStripe`/`getStripe` hits the checkout-success **server** module, not Stripe.js — confirmed not a client asset.) Both money flows are: same-origin HTML `<form>` → same-origin server action → `redirect()` to a Stripe-hosted URL.

- **Subscribe:** `app/pricing/page.tsx` forms post to `subscribeMonthlyAction` / `subscribeAnnualAction` (`app/pricing/subscribe-actions.ts`) → `runSubscribeAction` → on success **`app/pricing/subscribe-action.ts:29`**: `return deps.redirectFn(result.data.url)`. The URL comes from `createCheckoutSession` (`src/adapters/controllers/billing-controller.ts:104`) and resolves to **`https://checkout.stripe.com/…`**.
- **Manage Billing:** `app/(app)/app/billing/manage-billing-actions.ts` and `app/pricing/manage-billing-actions.ts` (each via its sibling `manage-billing-action.ts` wrapper) → `lib/manage-billing/manage-billing-core.ts` → `createPortalSession` (`src/adapters/controllers/billing-controller.ts:150`) → redirect to **`https://billing.stripe.com/…`**.

### Why this is genuinely uncertain

CSP `form-action` restricts the endpoints a form may submit to. [MDN explicitly warns](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action) that **browsers are inconsistent about whether `form-action` also applies to the redirect that occurs *after* a form submission**. Two paths exist here:

1. **JavaScript enabled (the common case):** React intercepts the form, POSTs to the server action via fetch, receives the redirect, and performs a **hard cross-origin navigation** (`window.location`) to Stripe. That is a *navigation*, not a form submission, so `form-action` does **not** apply. → works under enforcing.
2. **No JavaScript / progressive enhancement (Next.js server actions support this):** the browser does a **native POST** to the same-origin server action (allowed by `'self'`), the server replies **303 → `Location: https://checkout.stripe.com/…`**, and the browser follows it. Chrome has historically applied `form-action` to **the redirect target of a form submission**, which would **block** the checkout redirect.

So enforcing with bare `form-action 'self'` risks breaking checkout for the no-JS / progressive-enhancement path (and any browser that polices post-submit redirects).

---

## Why report-only's clean record does NOT clear this specific risk

This is the crux, and it is easy to get wrong. Report-only only logs a violation **when the risky code path is actually exercised in a real session.** Real users overwhelmingly have JavaScript, so they take path (1) above and **never hit the `form-action`-governed no-JS redirect.** Therefore 3 months of clean report-only data is strong evidence for *script-src/style-src/everything-else* but is **not** evidence that the no-JS billing redirect is safe — that path simply wasn't traveled. Concluding "zero reports ⇒ safe to enforce billing" would be a sampling error. We resolve it by construction (allowlist the hosts) rather than by hoping the untested path never occurs.

---

## Decision: harden `form-action`, then flip

Add the two Stripe redirect origins to `form-action` in `BASE_CLERK_CSP_DIRECTIVES` (`proxy.ts:96-110`), then set `reportOnly: false`.

**Why this works — verified against the SDK merge logic.** Custom directives for keys that exist in `DEFAULT_DIRECTIVES` go through `handleExistingDirective` (`content-security-policy.js:89-102`), which is a **deduplicating union** of the default values and ours. So:

```
ours:    form-action: ['self', 'https://checkout.stripe.com', 'https://billing.stripe.com']
emitted: form-action 'self' https://checkout.stripe.com https://billing.stripe.com
```

That is the **minimal correct allowlist**: exactly the two origins this app legitimately redirects forms to, and nothing more. (We do **not** add `js.stripe.com`, `q.stripe.com`, `r.stripe.com`, etc. — those are Stripe.js/telemetry hosts; we don't load Stripe.js.)

### Rejected alternatives

- **Bare one-line flip (no `form-action` change).** Smallest diff, but leaves the no-JS billing redirect exposed to a hard-to-debug, browser-dependent block on the *revenue* path. Rejected.
- **Browser-verify the JS path only, add nothing.** Confirms path (1) but proves nothing about path (2); not durable against a future browser tightening `form-action` enforcement. Kept as a *confirmation step*, rejected as the *sole* measure.
- **Take full manual CSP ownership (drop Clerk automatic CSP).** Would let us trim Clerk's broader defaults (`images.clerkstage.dev`, unused Stripe/Maps hosts), but it is a Medium–Large rewrite that discards Clerk's maintained defaults and nonce wiring. Disproportionate to this task. Rejected (revisit only if a SOC 2 audit demands a hand-owned minimal allowlist — tracked conceptually in DEBT-332).

---

## Exact changes (to be made *after* this doc is approved — not done yet)

1. **`proxy.ts`** — add `form-action` to `BASE_CLERK_CSP_DIRECTIVES` (currently `proxy.ts:96-110`), using the bare-keyword style the file already uses (`'self'`, not `"'self'"`; the SDK quotes keywords itself):

   ```ts
   'form-action': [
     'self',
     'https://checkout.stripe.com',
     'https://billing.stripe.com',
   ],
   ```

2. **`proxy.ts:208`** — `reportOnly: true` → `reportOnly: false`.

3. **`proxy.test.ts`** (TDD, red first) — there are **four** `reportOnly: true` assertions; **all four** must flip to `false`, or the suite breaks (the two type-declaration lines `reportOnly: boolean;` at `:16` and `:792` are *not* assertions and stay):
   - `proxy.test.ts:233` — directive test (block `195-242`). Also add an assertion here that `directives['form-action']` contains both Stripe origins.
   - `proxy.test.ts:593` — preview-toolbar test (block `584-663`).
   - `proxy.test.ts:741` — "includes Sentry ingest origin" test.
   - `proxy.test.ts:799` — "excludes Sentry ingest origin" test.

No other source files change. This is a header-mode + one-directive change.

---

## Test plan (TDD)

1. **Red:** update all four `proxy.test.ts` `reportOnly` assertions (`:233`, `:593`, `:741`, `:799`) to expect `reportOnly: false`, and add `form-action` ⊇ `{checkout.stripe.com, billing.stripe.com}`; run `pnpm test proxy` → fails against current code.
2. **Green:** apply the `proxy.ts` edits → tests pass.
3. **Full gate before push:** `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` (per AGENTS.md — `build` catches prerender issues nothing else does).

---

## Rollout & verification runbook

1. **Land on `dev`** (this doc's branch ships the doc only; the implementation is a follow-up PR after approval).
2. **Vercel preview enforces it.** On the preview URL, exercise both money flows and inspect:
   - **Network:** Subscribe and Manage Billing each reach a `https://checkout.stripe.com` / `https://billing.stripe.com` page (redirect followed, not blocked).
   - **Console:** zero `Refused to … because it violates … form-action` errors.
   - Repeat **with JavaScript disabled** (DevTools → Disable JavaScript) to exercise the progressive-enhancement path that the host allowlist specifically protects.
   - Confirm the **Vercel Toolbar** preview allowances still hold under enforcing — `proxy.ts:87-94` adds them only when `VERCEL_ENV === 'preview'`, so issue [#251](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/251) (`WEB-B`, `frame-src vercel.live`) must not regress.
3. **Check Sentry** for any historical `form-action` reports and for any new CSP issues arriving from the preview.
4. **Promote `dev` → `main`** via the standard promotion PR (the `main-protection` ruleset blocks direct push and requires the `test` check — see the main↔dev sync note). Merging moves `main` and triggers the production Vercel deploy.
5. **Post-production:** re-run the Subscribe smoke on `addictionboards.com`, then watch Sentry CSP issues for ~1 week.

---

## Rollback plan

Header-only change; no schema, data, or migration risk. Two options, fastest first:

- **Vercel Instant Rollback** to the previous production deployment (immediate; no code round-trip).
- **Revert PR** setting `reportOnly` back to `true` (and/or removing the `form-action` hosts), merged via the normal promotion path.

Either fully restores the current report-only posture.

---

## Definition of Done

- [ ] This doc is audited (CodeRabbit + owner) and approved.
- [ ] `proxy.ts`: `form-action` includes `checkout.stripe.com` + `billing.stripe.com`; `reportOnly: false`.
- [ ] `proxy.test.ts` updated (TDD) and green; full gate (`typecheck`/`lint`/`test`/`build`) green.
- [ ] Preview verification passed for Subscribe + Manage Billing, **including JS-disabled**, with zero `form-action` console violations and Vercel Toolbar (`WEB-B`) not regressed.
- [ ] Promoted to `main`; production Subscribe smoke passed; Sentry watched ~1 week with no new CSP blocks.
- [ ] DEBT-332's final DoD item (enforcing CSP enabled) checked off, cross-referencing this doc.

---

## Citations (mechanically verified 2026-06-14)

| Claim | Location | Verified |
|---|---|---|
| Clerk CSP config is `strict: true, reportOnly: true` with `reportTo` | `proxy.ts:205-214` (flag at `:208`) | ✅ |
| Custom directives object + Sentry endpoint wiring | `proxy.ts:77-110` | ✅ |
| Preview-only Vercel Toolbar allowances | `proxy.ts:87-94` (gated `VERCEL_ENV==='preview'`) | ✅ |
| Clerk default `form-action: ["self"]` | `@clerk/nextjs@7.4.3 …/server/content-security-policy.js:67` | ✅ |
| Strict mode edits only `script-src` (nonce + strict-dynamic; strips `http:`/`https:`) | same file, lines 139-146 | ✅ |
| `reportOnly` toggles header name only; reporting independent | same file, lines 168-176 | ✅ |
| Custom directive on a default key = deduplicating union | same file, `handleExistingDirective` lines 89-102 | ✅ |
| Subscribe success redirect to checkout URL | `app/pricing/subscribe-action.ts:29` | ✅ |
| Checkout / portal controllers | `src/adapters/controllers/billing-controller.ts:104,150` | ✅ |
| Manage-billing surfaces | `app/pricing/manage-billing-actions.ts`, `app/(app)/app/billing/manage-billing-actions.ts`, `lib/manage-billing/manage-billing-core.ts` | ✅ |
| Nonce plumbing for strict mode | `app/layout.tsx:71`, `components/providers.tsx:67`, `components/theme-provider.tsx:11` | ✅ |
| Production header shows `form-action 'self'`; report-only verified clean (sans billing) | DEBT-332 §"Historical Captured CSP Headers (Pre-Strict Baseline)" (line 104), §Definition of Done (line 412) | ✅ |

### External references

- MDN — `form-action` (post-submit redirect behavior is inconsistent): <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action>
- Clerk CSP guide: <https://clerk.com/docs/guides/secure/best-practices/csp-headers>
- Next.js CSP (App Router, nonce): <https://nextjs.org/docs/app/guides/content-security-policy>
- Stripe security guide (no client Stripe.js here): <https://docs.stripe.com/security/guide>
