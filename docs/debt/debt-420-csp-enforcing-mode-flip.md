# DEBT-420: Promote Clerk Strict CSP from Report-Only to Enforcing

**Priority:** P2
**Created:** 2026-06-14
**Status:** Proposed — **documentation only. No code has changed.** This is the execution contract for the follow-up implementation PR.
**Source:** Owner request to close the last open item of DEBT-332; GitHub issue [#245](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/245).
**Parent audit:** [DEBT-332 Security Posture Audit](./debt-332-security-posture-audit.md).
**Related:** [`proxy.ts`](../../proxy.ts), [`proxy.test.ts`](../../proxy.test.ts), billing server-action forms, issues [#245](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/245) and [#251](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/251).
**Citations verified:** 2026-06-14 against `debt/420-csp-enforce-flip` @ `94b780fe`, `dev` @ `8f5c1c24`, and installed `@clerk/nextjs@7.4.3` (`package.json` constraint `^7.4.1`).

---

## Decision

Promote the existing Clerk strict CSP from report-only to enforcing **only after** adding the Stripe billing redirect origins to `form-action` and verifying the actual Stripe account returns those origins.

The implementation path is intentionally small:

1. Add `form-action` to `BASE_CLERK_CSP_DIRECTIVES` in `proxy.ts:96-110`.
2. Flip `contentSecurityPolicy.reportOnly` from `true` to `false` in `proxy.ts:208`.
3. Update the four stale `proxy.test.ts` `reportOnly` assertions and add the `form-action` assertion.

No dashboard toggle is needed for the CSP mode itself; `proxy.ts:205-214` is the code-owned Clerk CSP configuration. The only dashboard/account dependency — verifying Stripe's hosted Checkout and Billing Portal origins — is now **closed**: the account has no custom domain, so the defaults `checkout.stripe.com` / `billing.stripe.com` apply (verified 2026-06-14; see "Billing Path and Stripe Host Verification").

---

## Current Evidence Boundary

DEBT-332 does **not** prove a continuous three-month clean CSP record. It records a deployed verification on 2026-03-21 with zero CSP violations across production/dev auth, theme, protected/paywall routes, and health checks; it explicitly says Stripe Checkout / Billing Portal was **not** exercised end-to-end (`docs/debt/debt-332-security-posture-audit.md:412`).

Therefore the implementation PR must re-check Sentry immediately before merge:

- Query Sentry Security Header issues/reports for `effective-directive: form-action`.
- Query for any new CSP issue, not only `form-action`.
- Time window: from the preview deployment timestamp through the merge decision.
- A clean Sentry check is required evidence; this doc must not be read as historical proof that billing was already covered.

---

## Current CSP Ownership and SDK Behavior

`proxy.ts` owns the current CSP:

```ts
// proxy.ts:205-214
contentSecurityPolicy: {
  directives: CLERK_CSP_DIRECTIVES,
  strict: true,
  reportOnly: true,
  ...(sentrySecurityHeaderEndpoint
    ? { reportTo: sentrySecurityHeaderEndpoint }
    : {}),
},
```

Verified facts:

| Fact | Evidence |
|---|---|
| `proxy.ts` derives Sentry ingest and Security Header endpoints from `NEXT_PUBLIC_SENTRY_DSN`. | `proxy.ts:77-85` |
| `BASE_CLERK_CSP_DIRECTIVES` currently has no `form-action` key and uses bare keyword values such as `self` and `none`. | `proxy.ts:96-110` |
| Preview-only Vercel Toolbar allowances are merged only when `VERCEL_ENV === 'preview'`. | `proxy.ts:87-94`, `proxy.ts:111-117` |
| Clerk default CSP includes `"form-action": ["self"]`. | `node_modules/.pnpm/.../@clerk/nextjs/dist/esm/server/content-security-policy.js:56-88`, specifically `:67` |
| Clerk strict mode edits only `script-src`: removes `http:`/`https:`, adds `'strict-dynamic'`, and adds a nonce when one exists. | same SDK file `:139-146` |
| A custom directive whose key already exists in Clerk defaults is a deduplicating union of default plus custom values. | same SDK file `:89-102`, `:147-156` |
| `reportTo` appends the CSP `report-to csp-endpoint` directive and emits `Reporting-Endpoints`. | same SDK file `:168-170` |
| `reportOnly: true` emits `Content-Security-Policy-Report-Only`; `false` emits `Content-Security-Policy`. | same SDK file `:172-176` |
| `x-nonce` is emitted when strict mode generates a nonce. | same SDK file `:166`, `:177-178` |
| `report-uri` is not emitted by Clerk's `reportTo`; it comes from our custom directive. | `proxy.ts:107-109` |

---

## Exact Enforcing Header Shape

This is the production enforcing header shape after the intended `form-action` edit, reconstructed from current `proxy.ts` plus installed Clerk SDK source. Values derived from environment/runtime are marked explicitly:

```http
Reporting-Endpoints:
  csp-endpoint="<SENTRY_SECURITY_HEADER_ENDPOINT_FROM_NEXT_PUBLIC_SENTRY_DSN>"

Content-Security-Policy:
  base-uri 'self';
  connect-src 'self'
    https://clerk-telemetry.com
    https://*.clerk-telemetry.com
    https://api.stripe.com
    https://maps.googleapis.com
    https://img.clerk.com
    https://images.clerkstage.dev
    <CLERK_FAPI_HOST>
    ws:
    wss:
    <SENTRY_INGEST_ORIGIN_FROM_NEXT_PUBLIC_SENTRY_DSN>;
  default-src 'self';
  font-src 'self' data: https:;
  form-action 'self' https://checkout.stripe.com https://billing.stripe.com;
  frame-ancestors 'none';
  frame-src 'self'
    https://challenges.cloudflare.com
    https://*.js.stripe.com
    https://js.stripe.com
    https://hooks.stripe.com;
  img-src 'self' https://img.clerk.com data: blob: https:;
  object-src 'none';
  report-uri <SENTRY_SECURITY_HEADER_ENDPOINT_FROM_NEXT_PUBLIC_SENTRY_DSN>;
  script-src 'self'
    'unsafe-inline'
    https://*.js.stripe.com
    https://js.stripe.com
    https://maps.googleapis.com
    'strict-dynamic'
    'nonce-<per-request-generated>';
  style-src 'self' 'unsafe-inline';
  worker-src 'self' blob:;
  report-to csp-endpoint

x-nonce: <per-request-generated>
```

Notes:

- Production `script-src` does not include `http:`, `https:`, or dev-only `'unsafe-eval'` after strict mode. Clerk removes `http:`/`https:` in strict mode (`content-security-policy.js:139-146`); `'unsafe-eval'` is conditional on `NODE_ENV !== 'production'` in Clerk defaults (`content-security-policy.js:76-85`).
- The final production value of `<CLERK_FAPI_HOST>` is runtime-owned by Clerk. DEBT-332's production capture showed `clerk.addictionboards.com` (`docs/debt/debt-332-security-posture-audit.md:99`, `:302`), but the implementation PR must still inspect the preview/prod response header before merge.
- The final Sentry endpoint and ingest origin come from `NEXT_PUBLIC_SENTRY_DSN` parsing in `proxy.ts:77-85`, `proxy.ts:25-59`, and `proxy.ts:107-110`.

---

## Directive-by-Directive Enforce Sweep

| Directive | What current app uses | Allowed under enforcing? | Evidence / action |
|---|---|---|---|
| `default-src 'self'` | Fallback only; explicit directives cover the resource classes below. | Yes. | Clerk default at `content-security-policy.js:66`; no implementation action. |
| `script-src` | Next/React app scripts, Clerk client components, and `next-themes` initialization. No app-owned `next/script`, literal `<script>`, `dangerouslySetInnerHTML`, `eval(`, `new Function`, `new Worker`, or app-owned `<iframe>` matched in `app/`, `components/`, `lib/`, or `src` on 2026-06-14. | Yes, with strict nonce. | Nonce read at `app/layout.tsx:71`, passed to Clerk at `components/providers.tsx:65-68`, and to `next-themes` at `components/theme-provider.tsx:5-11`; Clerk strict script rewrite at `content-security-policy.js:139-146`. |
| `style-src` | Tailwind/static CSS, Clerk component styles, and `next-themes`. | Yes. | Clerk default includes `unsafe-inline` at `content-security-policy.js:86`; `next-themes` receives nonce at `components/theme-provider.tsx:5-11`. |
| `img-src` | App has no rendered production image assets under `public/`; Clerk image host is allowed; `data:`, `blob:`, and `https:` are added by `proxy.ts`. | Yes. | `proxy.ts:105`; Clerk default `img-src` at `content-security-policy.js:75`. |
| `font-src` | Next Google font imports in root layout. | Yes. | Fonts imported via `next/font/google` at `app/layout.tsx:3`; `font-src` includes `self`, `data:`, `https:` at `proxy.ts:103`. |
| `connect-src` | Clerk FAPI, Clerk telemetry, Sentry client reporting, server-action/fetch traffic to same origin, preview Vercel Toolbar websocket when preview. | Yes. | Sentry client init at `sentry.client.config.ts:3-15`; Sentry origin added at `proxy.ts:77-85`, `proxy.ts:98-102`; preview Vercel `connect-src` at `proxy.ts:87-94`. |
| `frame-src` | Clerk may use Cloudflare challenge iframe; preview Vercel Toolbar iframe; app does not own an iframe. | Yes. | Clerk default allows `https://challenges.cloudflare.com` at `content-security-policy.js:68-74`; preview Vercel frame allowance at `proxy.ts:91`. |
| `worker-src` | No app-owned web worker matched in the production app scan; Clerk default allows `self blob:`. | Yes. | Clerk default at `content-security-policy.js:87`. |
| `form-action` | Real server-action HTML forms for Subscribe and Manage Billing. These forms can degrade to native POST + redirect when JavaScript is disabled. | Yes only after the intended Stripe-origin allowlist is added and verified against the account. | Pricing Manage Billing form at `app/pricing/pricing-view.tsx:63-73`, pricing Subscribe forms at `app/pricing/pricing-view.tsx:144-159` and `:179-194`, app Billing form at `app/(app)/app/billing/page.tsx:85-89`; current Clerk default is only `self` at `content-security-policy.js:67`. |
| `base-uri` | App should only use same-origin base behavior. | Yes. | Custom directive at `proxy.ts:96-98`. |
| `object-src` | App does not embed objects. | Yes. | Custom directive at `proxy.ts:106`. |
| `frame-ancestors` | App is not designed to be embedded. | Yes. | Custom directive at `proxy.ts:104`; `next.config.ts` also sets `X-Frame-Options: DENY` at `next.config.ts:27-29`. |

Preview non-regression requirement: issue #251 / WEB-B stays covered because Vercel Toolbar directives are included only for preview (`proxy.ts:87-94`, `proxy.ts:111-117`) and are not present in production.

Mechanical no-match scans on 2026-06-14: `rg -n "next/script|<Script|<script|dangerouslySetInnerHTML|eval\(|new Function|new Worker|<iframe" app components lib src --glob '!**/*.test.*' --glob '!**/*.spec.*'` returned no matches; `rg -n "@stripe/stripe-js|@stripe/react-stripe-js|loadStripe|getStripe|stripe-js|<iframe|js\.stripe" app components lib src package.json --glob '!**/*.test.*' --glob '!**/*.spec.*'` returned only server-side Stripe imports/usages and no client Stripe.js package.

---

## Billing Path and Stripe Host Verification

The app's billing forms are real server-action forms:

- Pricing Subscribe forms submit to `subscribeMonthlyAction` / `subscribeAnnualAction` from `app/pricing/pricing-view.tsx:144-159` and `app/pricing/pricing-view.tsx:179-194`.
- Pricing Manage Billing submits to `manageBillingAction` from `app/pricing/pricing-view.tsx:63-73` and `app/pricing/pricing-view.tsx:112-117`.
- App Billing Manage Billing submits to `manageBillingAction` from `app/(app)/app/billing/page.tsx:85-89`.
- Subscribe redirects to the URL returned by the controller at `app/pricing/subscribe-action.ts:25-29`.
- The controller creates Checkout and Portal sessions at `src/adapters/controllers/billing-controller.ts:104-148` and `src/adapters/controllers/billing-controller.ts:150-190`.

The expected default Stripe origins are:

```ts
'form-action': [
  'self',
  'https://checkout.stripe.com',
  'https://billing.stripe.com',
],
```

Those hosts are **not** a code fact. Stripe returns opaque hosted URLs:

- Checkout session creation calls `stripe.checkout.sessions.create(...)` at `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:708-718`, carries the returned/retrieved `session.url` at `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:350-362`, and returns `canonicalRecoveredSession.url` at `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:806-813`.
- Billing Portal session creation calls `stripe.billingPortal.sessions.create(...)` at `src/adapters/gateways/stripe/stripe-portal.ts:32-39` and returns `session.url` at `src/adapters/gateways/stripe/stripe-portal.ts:41-48`.

**VERIFIED 2026-06-14 — the target account has NO custom domain.** The account's Custom Domains settings (`dashboard.stripe.com/settings/custom-domains`) were inspected directly by the owner on 2026-06-14 and show all hosted products on Stripe defaults, with an "Add your domain" call-to-action (i.e., none configured):

| Product | Hosted domain |
|---|---|
| Checkout | `checkout.stripe.com` |
| Payment Links | `buy.stripe.com` |
| Customer Portal | `billing.stripe.com` |

The custom-domain setting is a single account-level toggle covering Checkout, Payment Links, and the Customer Portal (Stripe docs: "You can only set one custom domain per account"), so this one check is authoritative for both billing redirect origins this app uses. The `form-action` allowlist (`https://checkout.stripe.com` + `https://billing.stripe.com`) is therefore **correct as written**; no custom origin needs to be added. The Stripe account-info read also confirmed a single live account with no Connect/`on_behalf_of` indirection that would force the default domain anyway.

**Re-check trigger:** if a custom Checkout/Portal domain is ever added in the Stripe Dashboard, this allowlist and the matching `proxy.test.ts` assertion must be updated to include that origin (the `form-action` directive would otherwise block the redirect under enforcing).

With this item closed, the remaining pre-merge gates are purely runtime: the preview header/billing verification and the Sentry re-check below.

---

## Exact Implementation Changes

1. **`proxy.ts`** — add `form-action` to `BASE_CLERK_CSP_DIRECTIVES` (`proxy.ts:96-110`), using bare keyword style:

   ```ts
   'form-action': [
     'self',
     'https://checkout.stripe.com',
     'https://billing.stripe.com',
   ],
   ```

   If the mandatory Stripe account-origin verification finds a custom hosted origin, include that origin here too.

2. **`proxy.ts:208`** — change `reportOnly: true` to `reportOnly: false`.

3. **`proxy.test.ts`** — update all four real `reportOnly: true` assertions to `false`; leave the two type declarations alone:

   - `proxy.test.ts:233` — directive test block. Add an assertion that `directives['form-action']` includes `self`, `https://checkout.stripe.com`, `https://billing.stripe.com`, and any verified custom Stripe origin.
   - `proxy.test.ts:593` — preview-toolbar test.
   - `proxy.test.ts:741` — Sentry ingest/reporting test.
   - `proxy.test.ts:799` — no-Sentry test.
   - Do not edit the type declarations at `proxy.test.ts:16` or `proxy.test.ts:792`.

No application billing, Stripe, Sentry, Clerk, layout, or provider source files should change for this debt item.

---

## TDD and Quality Gate

1. **Red:** update the four `proxy.test.ts` `reportOnly` assertions and add the `form-action` assertion. Run the non-watch focused test:

   ```bash
   pnpm test --run proxy.test.ts
   ```

   This must fail against current `proxy.ts`.

2. **Green:** apply the `proxy.ts` edits. Re-run:

   ```bash
   pnpm test --run proxy.test.ts
   ```

3. **Full gate before every push** — use the canonical AGENTS gate (`AGENTS.md:127-157`):

   ```bash
   pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
   ```

4. **Conditional local E2E:** if `.env.local` contains the documented authenticated billing E2E variables (`AGENTS.md:141-152`), also run:

   ```bash
   pnpm test:e2e
   ```

`pnpm test` without `--run` is watch mode (`AGENTS.md:266-268`) and is not acceptable for this execution doc.

---

## Rollout and Verification Runbook

### Preview

1. Deploy the implementation branch to Vercel Preview with `VERCEL_ENV=preview`.
2. Confirm the response header is enforcing, not report-only:
   - `Content-Security-Policy` is present.
   - `Content-Security-Policy-Report-Only` is absent.
   - `Reporting-Endpoints` is present when `NEXT_PUBLIC_SENTRY_DSN` is configured.
   - `x-nonce` is present.
   - `form-action` contains `self`, the verified Checkout origin, and the verified Billing Portal origin.
3. Subscribe flow, JavaScript enabled:
   - Use a signed-in, non-entitled user.
   - Open the preview `/pricing` page.
   - Click Subscribe.
   - In Network, confirm the same-origin server-action request returns/follows a redirect and the final navigation reaches the verified Checkout origin.
   - Filter Console for `Content-Security-Policy` and `form-action`; there must be zero violations.
4. Subscribe flow, JavaScript disabled:
   - DevTools -> Disable JavaScript.
   - Reload `/pricing`.
   - Submit the Subscribe form.
   - Confirm the native POST / 303 path reaches the verified Checkout origin.
   - Confirm zero `form-action` console violations.
5. Manage Billing flow, JavaScript enabled:
   - Use a signed-in user with an existing Stripe customer/subscription row.
   - Open a surface that renders Manage Billing (`/pricing?reason=manage_billing` or `/app/billing`).
   - Submit Manage Billing.
   - In Network, confirm redirect/final navigation reaches the verified Billing Portal origin.
   - Confirm zero CSP/form-action console violations.
6. Manage Billing flow, JavaScript disabled:
   - DevTools -> Disable JavaScript.
   - Reload the same Manage Billing surface.
   - Submit the form.
   - Confirm the native POST / 303 path reaches the verified Billing Portal origin.
   - Confirm zero CSP/form-action console violations.
7. Preview toolbar regression check:
   - Confirm the Vercel Toolbar still loads/opens in preview.
   - Confirm no CSP blocks for `vercel.live`; preview-only directives are at `proxy.ts:87-94`.
8. Sentry check before merge:
   - Query from preview deployment time through review time.
   - Required clean result: no `effective-directive: form-action` issue/report and no new CSP issue of any directive.

Preview should use Stripe test mode unless the preview is intentionally wired to live Stripe. Record which mode was tested.

### Production

1. Promote via the standard `dev` -> `main` path; do not direct-push around branch protection.
2. After the production Vercel deployment is ready, re-capture headers on `https://addictionboards.com/pricing`:
   - `Content-Security-Policy` present.
   - `Content-Security-Policy-Report-Only` absent.
   - `form-action` contains the verified production Checkout and Billing Portal origins.
3. Production smoke:
   - Use the smallest safe live-mode smoke available for the current business state.
   - If there is no payer/customer to test Manage Billing safely, do not fake confidence; record Manage Billing production live smoke as deferred and keep enforcing rollback criteria active.
   - If a live test account/customer exists, repeat the Subscribe and Manage Billing checks above.
4. Sentry watch:
   - Immediately after production smoke, query the deployment-to-now window for `effective-directive: form-action` and any new CSP issue.
   - Continue watching CSP issues for 7 days.

### Rollback Triggers

Use **Vercel Instant Rollback** immediately if any of these occur in production:

- Checkout or Billing Portal navigation fails because the browser reports a CSP `form-action` block.
- Sentry receives a production CSP issue where `effective-directive` is `form-action` and the blocked URI is a legitimate Stripe Checkout/Portal host.
- A currently working page fails to load required scripts/styles because of the enforcing CSP.

Use a normal revert PR instead of instant rollback only for non-user-blocking cleanup, such as correcting a test assertion or tightening a doc after successful production behavior.

The rollback is header-only: no schema, migration, or data mutation is involved. Reverting `reportOnly` to `true` restores the current non-blocking posture.

---

## Background Aside: Rejected Broader Work

Full manual CSP ownership could remove unused Clerk defaults such as `images.clerkstage.dev`, Stripe JS frame hosts, or Google Maps sources. That is not part of this debt item. Clerk automatic CSP is already integrated with strict-mode nonce generation and provider plumbing; replacing it would be a broader CSP-ownership project, not a minimal enforcing-mode flip.

Rejected implementation shortcuts:

- Flip `reportOnly` without `form-action` hardening: leaves the server-action billing forms exposed to browser-dependent redirect blocking.
- Verify only the JavaScript-enabled path: does not exercise the no-JS/native POST path the allowlist is meant to protect.
- Add broad Stripe domains: not justified by current code; this app does not load Stripe.js or embedded Stripe frames from app code.

---

## Definition of Done

- [ ] This doc is audited and owner-approved.
- [ ] Stripe Checkout and Billing Portal returned origins are verified for the target account/mode; any custom origin is added to `form-action`.
- [ ] `proxy.ts`: `form-action` includes `self` plus verified Stripe origins; `reportOnly: false`.
- [ ] `proxy.test.ts`: four `reportOnly` assertions flipped; type declarations untouched; `form-action` assertion added.
- [ ] Focused red/green run uses `pnpm test --run proxy.test.ts`.
- [ ] Full AGENTS gate is green: `typecheck`, `lint`, unit, browser, integration, build.
- [ ] Conditional local E2E is green when documented billing E2E credentials exist.
- [ ] Preview header capture confirms enforcing CSP, `Reporting-Endpoints`, `x-nonce`, and expected `form-action`.
- [ ] Preview Subscribe and Manage Billing pass with JavaScript enabled and disabled, with zero Console/Sentry CSP violations.
- [ ] Vercel Toolbar preview regression check passes.
- [ ] Sentry is checked immediately before promotion for `form-action` and any new CSP issue.
- [ ] Production header capture and safe smoke complete; Sentry watched for 7 days.
- [ ] DEBT-332's final DoD item is checked off or explicitly risk-accepted with evidence.

---

## Citations

| Claim | Location |
|---|---|
| Canonical full gate and conditional E2E rule | `AGENTS.md:127-157` |
| `pnpm test` is watch mode; `pnpm test --run` is CI-style | `AGENTS.md:266-268` |
| Installed Clerk and Stripe package constraints | `package.json:45`, `package.json:68` |
| Current Clerk CSP config is `strict: true`, `reportOnly: true`, conditional `reportTo` | `proxy.ts:205-214` |
| Sentry endpoint/origin parsing | `proxy.ts:25-59`, `proxy.ts:77-85` |
| Custom directives and missing current `form-action` key | `proxy.ts:96-110` |
| Preview Vercel Toolbar directives and gating | `proxy.ts:87-94`, `proxy.ts:111-117` |
| Four real `reportOnly` test assertions | `proxy.test.ts:233`, `proxy.test.ts:593`, `proxy.test.ts:741`, `proxy.test.ts:799` |
| `reportOnly` type declarations, not assertions | `proxy.test.ts:16`, `proxy.test.ts:792` |
| Clerk default directives, including `form-action self` | `node_modules/.pnpm/.../@clerk/nextjs/dist/esm/server/content-security-policy.js:56-88` |
| Clerk existing-directive deduplicating union | same SDK file `:89-102`, `:147-156` |
| Clerk strict script rewrite and nonce | same SDK file `:139-146`, `:166`, `:177-178` |
| Clerk `reportTo`, `Reporting-Endpoints`, and enforcing/report-only header selection | same SDK file `:168-176` |
| DEBT-332 point-in-time verification and billing gap | `docs/debt/debt-332-security-posture-audit.md:412` |
| Nonce read and provider plumbing | `app/layout.tsx:71`, `components/providers.tsx:65-68`, `components/theme-provider.tsx:5-11` |
| Sentry client reporting is configured from `NEXT_PUBLIC_SENTRY_DSN` | `sentry.client.config.ts:3-15` |
| Pricing Subscribe forms | `app/pricing/pricing-view.tsx:144-159`, `app/pricing/pricing-view.tsx:179-194` |
| Pricing Manage Billing forms | `app/pricing/pricing-view.tsx:63-73`, `app/pricing/pricing-view.tsx:112-117` |
| App Billing Manage Billing form | `app/(app)/app/billing/page.tsx:85-89` |
| Subscribe redirects to returned URL | `app/pricing/subscribe-action.ts:25-29` |
| Billing controller creates Checkout and Portal sessions | `src/adapters/controllers/billing-controller.ts:104-148`, `src/adapters/controllers/billing-controller.ts:150-190` |
| Checkout returns Stripe `session.url` | `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:350-362`, `:708-718`, `:806-813` |
| Billing Portal returns Stripe `session.url` | `src/adapters/gateways/stripe/stripe-portal.ts:32-49` |
| `X-Frame-Options: DENY` also exists | `next.config.ts:27-29` |

### External Reference

- MDN — `form-action` restricts form submission targets and browser behavior on post-submit redirects is inconsistent: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action>
