# DEBT-332: Security Posture Audit — CSP Findings, Health Endpoint Disclosure, Hardening Opportunities

**Priority:** P2
**Created:** 2026-03-21
**Source:** Deep security audit prompted by Delve/Supabase public-bucket incident
**Related:** [ADR-009 Security Hardening](../adr/adr-009-security-hardening.md), [SPEC-017 Rate Limiting](../specs/spec-017-rate-limiting.md), [next.config.ts](../../next.config.ts), [proxy.ts](../../proxy.ts)

---

## Context

A third-party compliance company (Delve) was exposed for having a publicly accessible Supabase storage bucket leaking employee PII, session tokens, and equity documents — despite selling SOC 2 compliance to 1,500 companies. This prompted a from-first-principles audit of our own Neon/Postgres/Vercel stack.

**Overall finding: no critical vulnerabilities.** The architecture is fundamentally sound — database access is server-only, auth is enforced at every layer, webhooks verify signatures, rate limiting is comprehensive. However, a rigorous security review surfaces three items that best-practice-first engineers (or a real SOC 2 auditor) would flag.

## Implementation Update (2026-03-21)

- **Item 2 resolved:** `GET /api/health` now returns only `{ ok: true, db: true }` to unauthenticated callers. The public timestamp disclosure was removed.
- **Item 1 Phase 0-2 implemented:** the current runtime target is **Clerk strict mode in report-only**. `proxy.ts` now uses Clerk `strict: true` with `reportOnly: true`, wires `report-uri` plus Clerk `reportTo`/`Reporting-Endpoints` to Sentry's Security Header endpoint, and keeps enforcing mode disabled.
- **Nonce plumbing is in place:** `app/layout.tsx` reads `x-nonce` from `next/headers`, `components/providers.tsx` passes `dynamic` plus `nonce` into `ClerkProvider`, and `components/theme-provider.tsx` forwards the nonce to `next-themes`.
- **Local runtime verification passed:** on `2026-03-21`, `pnpm build && pnpm start` confirmed `Content-Security-Policy-Report-Only`, `Reporting-Endpoints`, and `x-nonce` are emitted, and a same-response capture confirmed the rendered HTML nonce matches the response `x-nonce` header.
- **Remaining work:** deploy-phase validation and any move from report-only to enforcing mode remain separate follow-up work.

---

## Item 1: CSP Exists, but the Current Posture Is Broader Than Intended and the Prior Write-Up Was Inaccurate (MEDIUM)

### The Problem

The original version of this debt doc got the CSP situation wrong in several important ways:

1. **We do already have CSP on proxy-matched routes.** `proxy.ts` configures Clerk's automatic CSP via `contentSecurityPolicy`, and public routes still traverse the middleware; they only skip `auth.protect()`.
2. **Clerk already injects `default-src`, `script-src`, and `style-src`.** Our custom directives are *merged into* Clerk's defaults; they do not replace them.
3. **The real problem is the opposite of what this doc originally claimed:** the effective automatic policy is broader than our app actually needs, and the previously proposed "exact combined policy" is not what browsers would receive from the current implementation.

### Why This Matters

CSP is still worth caring about. It is a strong defense-in-depth control against XSS and unexpected third-party resource execution. But this repo is **not** in a "no CSP at all" state. The security debt is subtler:

- We are relying on a **Clerk-owned automatic policy** whose defaults are broader than this application needs.
- The current implementation **cannot produce a minimal exact allowlist** by simply expanding `CLERK_CSP_DIRECTIVES`, because Clerk merges custom directives with its defaults.
- The previous version of this document created a false mental model of both the current risk and the available implementation options.

### Current State

```text
next.config.ts headers:     ✅ X-Content-Type-Options, Referrer-Policy, X-Frame-Options,
                              Permissions-Policy, Strict-Transport-Security
                            ❌ No static/manual CSP in next.config.ts

proxy.ts Clerk middleware:   ✅ Automatic Clerk CSP is enabled
                            ✅ Public routes still traverse middleware
                            ✅ Clerk injects default-src/script-src/style-src
                            ⚠️ Effective policy is broader than our app needs
```

### Captured CSP Headers (Ground Truth)

Verification was performed on **2026-03-21** across three environments:

1. **Local dev:** `pnpm dev`, captured via `curl -sSI`
2. **Local production build:** `pnpm build && pnpm start`, captured via `curl -sSI`
3. **Deployed production:** `https://addictionboards.com` public routes (`/` and `/pricing`), captured first via Chrome browser agent and then independently re-verified via `curl -sSI`

Local dev/prod verification covered:

- public pages such as `/` and `/pricing`
- auth pages such as `/sign-in`
- protected-route responses such as `/app/dashboard` (404 protect-rewrite in dev, 307 redirect in prod when signed out)
- API routes such as `/api/health` and `/api/stripe/webhook`

Deployed production verification covered the live public pages `/` and `/pricing`. Those two live headers are identical to each other and match the local production header except for the Clerk FAPI host.

The **only difference between environments** is:

| Environment | Clerk FAPI host in `connect-src` | `'unsafe-eval'` in `script-src` |
|---|---|---|
| Local dev (`pnpm dev`) | `infinite-jaguar-35.clerk.accounts.dev` | Present (Next.js dev mode) |
| Local prod build (`pnpm start`) | `infinite-jaguar-35.clerk.accounts.dev` | Absent |
| Deployed production (`addictionboards.com`) | `clerk.addictionboards.com` | Absent |

Everything else — every directive, every token — is character-for-character identical across the locally verified routes and the live production public routes. The Clerk FAPI host is the only value that changes, and it correctly reflects the Clerk instance configuration (dev instance locally, production custom domain on Vercel).

The block below reflects the **deployed production** header captured from `addictionboards.com`:

```http
content-security-policy:
  base-uri          'self';
  connect-src       'self'
                    https://clerk-telemetry.com
                    https://*.clerk-telemetry.com
                    https://api.stripe.com
                    https://maps.googleapis.com
                    https://img.clerk.com
                    https://images.clerkstage.dev
                    clerk.addictionboards.com
                    ws: wss:
                    https://o4508933259198464.ingest.us.sentry.io;
  default-src       'self';
  font-src          'self' data: https:;
  form-action       'self';
  frame-ancestors   'none';
  frame-src         'self'
                    https://challenges.cloudflare.com
                    https://*.js.stripe.com
                    https://js.stripe.com
                    https://hooks.stripe.com;
  img-src           'self'
                    https://img.clerk.com
                    data: blob: https:;
  object-src        'none';
  script-src        'self'
                    'unsafe-inline'
                    https: http:
                    https://*.js.stripe.com
                    https://js.stripe.com
                    https://maps.googleapis.com;
  style-src         'self' 'unsafe-inline';
  worker-src        'self' blob:
```

**What this tells us:**

| Directive | Observation | Concern |
|---|---|---|
| `script-src` | Includes `https:` and `http:` — allows scripts from **any** HTTPS or HTTP origin | Defeats the purpose of CSP for script injection; any attacker-controlled domain qualifies |
| `script-src` | Dev adds `'unsafe-eval'`; production does **not** | Verified: this is a Next.js development-mode artifact, not part of the production header |
| `connect-src` | Includes `api.stripe.com`, `maps.googleapis.com` | We don't use Stripe.js or Google Maps client-side — unnecessary allowances from Clerk defaults |
| `connect-src` | Includes `clerk-telemetry.com` | Clerk analytics; not required for app function but harmless |
| `connect-src` | Includes `images.clerkstage.dev` | **Verified as a Clerk SDK hardcoded default** — present in all environments including deployed production. See "Clerk SDK `images.clerkstage.dev` Finding" below |
| `frame-src` | Includes Stripe JS hosts and hooks | We don't embed Stripe iframes — unnecessary from Clerk defaults |

**The `https: http:` in `script-src` is the critical finding.** This makes the CSP effectively a no-op for script injection prevention, because any origin qualifies. This is what Clerk strict mode eliminates by switching to nonce + `'strict-dynamic'`.

### Verified Findings (Official Docs + Local Runtime)

This section was re-audited on **2026-03-21** against current official documentation for Clerk, Stripe, Sentry, and Next.js, then cross-checked against the installed packages and this repo's implementation.

#### Clerk

- Official Clerk docs say automatic CSP is available for `@clerk/nextjs >= 6.14.0` and is configured through `clerkMiddleware(..., { contentSecurityPolicy: ... })`.
- Clerk explicitly documents the following requirements in its prose guidance: the FAPI host and `https://challenges.cloudflare.com` in `script-src`, the FAPI host in `connect-src`, `https://img.clerk.com` in `img-src`, `'self' blob:` in `worker-src`, `'unsafe-inline'` in `style-src`, and `https://challenges.cloudflare.com` in `frame-src`.
- Clerk's **default automatic configuration** already injects `connect-src`, `default-src`, `form-action`, `frame-src`, `img-src`, `script-src`, `style-src`, and `worker-src`.
- Clerk's docs say additional directives are **merged with Clerk's default security settings**.
- Clerk strict mode still exists. It generates a per-request nonce, exposes it via `x-nonce`, and requires `<ClerkProvider dynamic>` for App Router usage.
- Clerk's docs still say `style-src 'unsafe-inline'` is required for Clerk component styling, and removing that requirement is merely "on Clerk's roadmap."

What that means for this repo:

- The prior claim that protected routes lacked `default-src`, `script-src`, and `style-src` was false.
- The prior claim that public routes had no CSP was also false. `proxy.ts` still runs Clerk middleware on public routes; it only skips `auth.protect()`. `proxy.test.ts` covers this behavior.
- Because Clerk merges defaults, our current `CLERK_CSP_DIRECTIVES` object **adds** values but cannot remove Clerk defaults such as broad `script-src` sources.

One important Clerk-doc nuance: the prose requirement list is internally inconsistent with Clerk's documented **default configuration**, shipped source, and emitted runtime header. The prose says `script-src` should include the FAPI host and `https://challenges.cloudflare.com`, but Clerk's default-mode directive list, the current source, and the actual emitted header do **not** add those hosts to `script-src`. In practice, default mode relies on the broad `https:` / `http:` scheme sources instead.

Cross-checking the installed `@clerk/nextjs` **6.38.1** runtime *(historical baseline — upgraded to 7.0.7 in DEBT-340)* confirms the automatic default at that time included a broad `script-src` containing `'unsafe-inline'`, `https:`, `http:`, Stripe JS hosts, and Google Maps. It also includes Clerk telemetry, `api.stripe.com`, Google Maps, and `images.clerkstage.dev` (a hardcoded staging domain — see gotcha #4 below) in `connect-src`. This is broader than our application needs. Runtime verification confirms that:

- `'unsafe-eval'` is present only in development (absent from both local prod build and deployed production)
- the broader `https:` / `http:` script allowances remain in production
- local runtime (`pnpm dev`, `pnpm start`) shows public pages, auth pages, protected-route responses, and API routes all receive the Clerk-owned CSP header under the current matcher
- deployed production public-route verification (`/` and `/pricing`) matches the same header shape as local production; the only cross-environment differences are the Clerk FAPI host (`infinite-jaguar-35.clerk.accounts.dev` locally vs `clerk.addictionboards.com` in production) and the expected dev-only `'unsafe-eval'`

#### Stripe

- Stripe's official security guide is **product-specific**:
  - Checkout requires `checkout.stripe.com`
  - Stripe.js requires `api.stripe.com`, `js.stripe.com`, `hooks.stripe.com`, and `maps.googleapis.com` only for Address Element / Google Maps cases
  - Connect embedded components require `connect-js.stripe.com`, `js.stripe.com`, and a specific `style-src` SHA
- Stripe's official docs do **not** say that every Stripe integration needs the union of all Stripe domains.
- Stripe's official docs do **not** list `q.stripe.com` or `r.stripe.com` as required CSP sources for the products relevant to this app.
- Stripe's official docs also say they do **not** currently support cross-origin isolated sites.

What that means for this repo:

- This app does **not** load Stripe.js, Elements, embedded Checkout, or Connect embedded components on our pages.
- Billing is implemented as **server-side redirect only**: server actions create Checkout / Billing Portal URLs and Next redirects the user to Stripe-hosted pages.
- Because our origin is not embedding Stripe client assets, the prior "combined policy" over-whitelisted Stripe domains for the current architecture.
- If we later add Stripe.js, Elements, embedded Checkout, Connect embedded components, or Address Element, this analysis changes and the policy must be revisited against the exact Stripe product docs.

#### Sentry

- The app uses `@sentry/nextjs`, and the client SDK is bundled in the app. There is no Sentry CDN loader in use, so there is no separate Sentry `script-src` requirement for this repo.
- Official Sentry docs for Security Policy Reporting recommend:
  - using the project's **Security Header endpoint**
  - sending **both** `report-uri` and `report-to` / `Reporting-Endpoints` for compatibility
  - ensuring the Sentry domain is permitted by `default-src` or `connect-src`, or the browser will block the report itself
- The installed Clerk SDK's `contentSecurityPolicy.reportTo` support is helpful but limited: it appends the CSP `report-to` directive and emits the `Reporting-Endpoints` header, but it does **not** emit the legacy `Report-To` header from Sentry's broader compatibility example.
- The previous wildcard example `https://*.ingest.us.sentry.io` is not the tightest or most portable rule. The current implementation is better: parse the **exact** origin from `NEXT_PUBLIC_SENTRY_DSN` and allow only that origin.
- Session Replay is disabled in `sentry.client.config.ts`, so Sentry does not create an additional replay-worker requirement in the current configuration.

#### Next.js

- Next.js still documents two valid CSP architectures:
  - **Proxy/middleware** for nonce-based CSP
  - **`next.config.js` headers** for non-nonce CSP
- Next.js still auto-extracts the nonce from the request `Content-Security-Policy` header and applies it to framework scripts, page bundles, and inline styles/scripts generated by Next.js.
- `unsafe-eval` remains a **development-only** requirement.
- Next.js also documents the tradeoff that nonce-based CSP requires **dynamic rendering**, disables static optimization / ISR / PPR compatibility, and reduces CDN caching opportunities.

### Implementation Architecture

**Where to set CSP:** `proxy.ts` is the correct ownership point for:

- Clerk automatic CSP
- any future nonce-based CSP
- per-request report-only / report-to configuration

But the earlier "NOT in `next.config.ts`" wording was too absolute. Next.js officially documents `next.config.js` as the right place for non-nonce CSP. The pragmatic repo-specific conclusion is:

- **If we stay on Clerk automatic CSP or move to strict mode, keep ownership in `proxy.ts`.**
- **If we ever decide to stop relying on Clerk automatic merging and own the exact policy ourselves, `next.config.ts` remains a valid option for a non-nonce policy.**

### Hidden Gotchas the Prior Doc Missed

1. **Clerk strict mode was not drop-in for the previous provider tree (now addressed, with one remaining nuance).**
   - Clerk's docs require `<ClerkProvider dynamic>` for strict mode.
   - Prior state: `components/providers.tsx` loaded `ClerkProvider` through `next/dynamic` with `ssr: false` and did not pass `dynamic`.
   - Current state: `components/providers.tsx` still uses the client-side `next/dynamic` wrapper, but now passes both `dynamic` and `nonce`, which is the key strict-mode requirement.
   - Remaining nuance: this differs from Clerk's simplest server-layout example, so deployed verification of auth flows remains part of the rollout before enforcing mode.

2. **`next-themes` nonce plumbing was required for strict mode (now addressed).**
   - `next-themes` supports a `nonce` prop for its injected inline script/style.
   - Prior state: `components/theme-provider.tsx` did not pass one.
   - Current state: `app/layout.tsx` reads `x-nonce` and threads it into `components/theme-provider.tsx`, which now forwards the nonce to `next-themes`.

3. **Clerk's automatic CSP is additive, not subtractive.**
   - The exact narrow allowlist previously written in this doc is **not realizable** through the current `contentSecurityPolicy.directives` merge behavior.
   - If we want to remove broad defaults such as `http:` / `https:` in `script-src` or unused Stripe / Google Maps domains, we need a different ownership model.

4. **Clerk SDK hardcodes `images.clerkstage.dev` in all environments (not a project misconfiguration).**
   - `images.clerkstage.dev` appears in the production CSP `connect-src` on `addictionboards.com`. This is **not** caused by a Clerk dashboard misconfiguration or an environment variable issue.
   - The domain is unconditionally hardcoded in [`@clerk/nextjs` → `packages/nextjs/src/server/content-security-policy.ts`](https://github.com/clerk/javascript/blob/main/packages/nextjs/src/server/content-security-policy.ts) inside the `DEFAULT_DIRECTIVES` object for `connect-src`.
   - It was added by Clerk engineer LauraBeatris in [PR #7610](https://github.com/clerk/javascript/pull/7610) (merged 2026-01-16) to support `fetch()` calls for organization creation image downloads. The `img-src` allowance for `img.clerk.com` only covers `<img>` tags, not `fetch()`, so both `img.clerk.com` and `images.clerkstage.dev` were added to `connect-src`.
   - There is **no conditional logic** — the staging domain ships to every Clerk instance, dev and production alike. The only environment-conditional directive in the entire file is `'unsafe-eval'` in `script-src`.
   - Clerk's official CSP docs do **not** document `images.clerkstage.dev`. During this audit, I did **not** find a newer upstream change making the domain conditional or removing it from the current `main` branch source.
   - **Impact:** Low. It widens the `connect-src` surface area by one unnecessary staging domain. It cannot be removed through `contentSecurityPolicy.directives`; removing it would require either an upstream Clerk change or taking full CSP ownership away from Clerk's automatic defaults.
   - **Recommendation:** Optionally file a low-severity issue on [`clerk/javascript`](https://github.com/clerk/javascript) requesting that `images.clerkstage.dev` be made conditional on instance type.

5. **`form-action 'self'` may interact unpredictably with Stripe checkout redirects — must verify before enforcing.**
   - Clerk's automatic CSP includes `form-action 'self'`, which restricts form submissions to same-origin.
   - The pricing page uses HTML forms that POST to same-origin server actions (`app/pricing/subscribe-actions.ts`), which then call `redirect()` with the Stripe Checkout URL returned by `billing-controller.ts`.
   - [MDN explicitly notes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action) that browser behavior is inconsistent on whether `form-action` blocks redirects *after* a form submission.
   - In report-only mode this is safe — violations are logged, not enforced. But before flipping to enforcing mode, the Subscribe and Manage Billing flows **must** be exercised in a browser and checked for `form-action` violation reports.
   - This also applies to any future auth provider that uses traditional `<form>` POST to an external domain (Clerk currently uses JS-based redirects, so it is unaffected today).

### Recommended Posture

For this application, the technically accurate recommendation is:

1. **Fix the documentation first.**
   - Stop claiming there is no CSP.
   - Stop claiming public routes receive no CSP.
   - Stop claiming the exact synthetic allowlist shown earlier is the policy browsers actually receive.

2. **Keep `proxy.ts` as the current CSP ownership point.**
   - That aligns with Clerk automatic CSP and any future nonce-based rollout.

3. **Use Clerk's built-in report-only support if we want a low-risk visibility phase.**
   - The installed Clerk SDK now exposes `reportOnly?: boolean` and `reportTo?: string` on `contentSecurityPolicy`.
   - Clerk's `reportTo` support covers the CSP `report-to` directive plus `Reporting-Endpoints`, but not the legacy `Report-To` header.
   - For compatibility, add `report-uri` and, if we want to match Sentry's full recommendation, set `Report-To` manually alongside Clerk's `reportTo` support.

4. **If we want a materially stronger CSP, plan a strict-mode rollout rather than a hand-written additive allowlist.**
   - Strict mode removes Clerk's broad `http:` / `https:` script allowances and gives us nonce-based protection.
   - But it requires provider / theme nonce work and dynamic-rendering tradeoff acceptance.

5. **If we want a truly minimal exact policy, Clerk automatic CSP is the wrong abstraction.**
   - We would need to own the CSP header manually and explicitly include only the sources justified by our actual stack.

### Decision Record

Decision (2026-03-21): Target Clerk strict mode. Accept dynamic-rendering tradeoff. Strict mode is now enabled in report-only (`strict: true`, `reportOnly: true`) with `report-uri` and `reportTo` wired to Sentry's Security Header endpoint. Provider and theme nonce plumbing is in place. Remaining step: promote to enforcing mode after deployed verification of auth flows, theme initialization, Sentry reporting, and billing redirects.

### Effort Estimate

- Documentation correction: Small
- Add report-only + reporting endpoints in current architecture: Small
- Strict-mode rollout with provider/theme fixes: Medium
- Manual exact CSP ownership replacing Clerk automatic CSP: Medium to Large

### Risk if Skipped

- We do **not** have a catastrophic "missing CSP" hole.
- We **do** have a documentation bug and a false sense of precision.
- We also currently rely on a Clerk-owned default policy that is broader than necessary, which weakens CSP's value as a hard allowlist.
- The `images.clerkstage.dev` staging domain in production CSP is a Clerk SDK default with no project-side fix — low risk, but worth noting for completeness.

### Sources Verified on 2026-03-21

- Clerk CSP docs: <https://clerk.com/docs/guides/secure/best-practices/csp-headers>
- Clerk SDK CSP source: [`packages/nextjs/src/server/content-security-policy.ts`](https://github.com/clerk/javascript/blob/main/packages/nextjs/src/server/content-security-policy.ts)
- Clerk SDK PR #7610 (added `images.clerkstage.dev`): <https://github.com/clerk/javascript/pull/7610>
- Stripe Integration Security Guide: <https://docs.stripe.com/security/guide>
- Sentry Security Policy Reporting (JavaScript): <https://docs.sentry.io/platforms/javascript/security-policy-reporting/>
- Sentry client key API (DSN / security header endpoints): <https://docs.sentry.io/api/projects/retrieve-a-client-key/>
- Next.js CSP guide (App Router): <https://nextjs.org/docs/app/guides/content-security-policy>
- **Local runtime verification:** `curl -sSI` against `/`, `/pricing`, `/sign-in`, `/app/dashboard`, `/api/health`, and `/api/stripe/webhook` on 2026-03-21 under both `pnpm dev` and `pnpm start` with `@clerk/nextjs` 6.38.1 *(historical baseline — upgraded to 7.0.7 in DEBT-340)*
- **Installed package cross-checks:** `@clerk/nextjs` 6.38.1 source/types *(historical — now 7.0.7)* and `next-themes` 0.4.6 source/types were inspected locally to verify `reportOnly`, `reportTo`, default CSP directives, and `nonce` support
- **Deployed production verification:** Chrome browser agent and direct `curl -sSI` captured response headers from `https://addictionboards.com/` and `https://addictionboards.com/pricing` on 2026-03-21 — confirmed they match the doc block exactly and match local prod build except for the Clerk FAPI host (`clerk.addictionboards.com`)

### Repo Files Relevant to This Audit

- `proxy.ts`
- `proxy.test.ts`
- `components/providers.tsx`
- `components/theme-provider.tsx`
- `sentry.client.config.ts`
- `app/pricing/subscribe-actions.ts`
- `app/pricing/subscribe-action.ts`
- `src/adapters/controllers/billing-controller.ts`

---

## Item 2: Health Endpoint Discloses DB Liveness (LOW)

### The Problem

Before this fix, `GET /api/health` returned `{ ok: true, db: true, timestamp: "..." }` to any unauthenticated caller. This told the world:
- Whether the application is up
- Whether the database is reachable
- The server's clock (useful for timing attacks against rate-limit windows)

**Historical file:** `app/api/health/handler.ts` (pre-fix implementation)

### Why This Matters (Barely)

In isolation, this is very low risk. The information is minimal, rate-limited (600/min), and exposes no version, hostname, or internal details. However:

- **OWASP API Security Top 10 (API7:2023)** recommends that health/status endpoints not leak internal topology to unauthenticated callers.
- An attacker probing infrastructure can use `db: false` to detect outages in real-time, potentially timing attacks during degraded states.
- The `timestamp` field reveals server clock skew, which can aid timing attacks against the rate limiter's fixed-window boundaries.

### What "Fixed" Looks Like

**Option A (minimal):** Return only `{ ok: true }` to unauthenticated callers. Move `db` and `timestamp` behind a bearer token (same pattern as the cron endpoint).

**Option B (pragmatic, recommended):** Keep `{ ok: true, db: true }` for uptime monitoring compatibility (Vercel, UptimeRobot, etc.) but drop `timestamp` from the public response. The timestamp provides no monitoring value — uptime tools record their own request timestamps.

### Effort Estimate

- Implementation: Tiny (remove one field from a JSON response)
- Risk if skipped: Negligible in practice; a finding in a formal pentest report but unlikely to enable a real attack

---

## Item 3: No Postgres Row-Level Security — Accepted Architecture Decision (INFORMATIONAL)

### The Situation

All 44 tables have `isRLSEnabled: false` in migration snapshots. No `CREATE POLICY` statements exist. All authorization is enforced in application code via the `findByIdAndUserId()` repository pattern.

### Why This Is Fine

This is **not** the same vulnerability as Supabase without RLS. The critical difference:

| | Supabase | Our Stack |
|---|---|---|
| Browser-to-DB path | Yes (PostgREST + anon key) | No |
| RLS required for safety | Yes (it's the only auth layer) | No |
| Auth enforcement | Postgres policies | Application code (controllers → use cases → repositories) |

RLS is Supabase's *primary* authorization mechanism because the browser talks directly to Postgres. In our architecture, the browser talks to Server Actions, which go through controllers → use cases → repositories, with auth checks at the controller layer (`requireEntitledUserId`) and ownership validation in every repository WHERE clause.

### When to Revisit

- If we ever expose a direct database API (GraphQL with Hasura, PostgREST, Supabase migration)
- If we add a second data access path that bypasses the repository layer
- If a formal SOC 2 audit requires defense-in-depth at the database level

**No action needed now.** This is documented for transparency, not as debt to pay.

---

## What an Auditor Would Say

If a competent security auditor reviewed this codebase:

| Finding | Severity | Their Verdict |
|---------|----------|---------------|
| CSP is present but broad / Clerk-owned / underdocumented | **Medium** | "Correct the documentation, decide whether Clerk automatic CSP is acceptable, and tighten if compliance requires a stronger allowlist." |
| Health endpoint timestamp | **Informational** | "Minor information disclosure. Consider removing." |
| No RLS | **Informational** | "Application-level auth is adequate. Document the decision." |
| Secrets management | **Pass** | "Server-only, env-validated, gitignored. No findings." |
| Auth enforcement | **Pass** | "Consistent `requireEntitledUserId` + repository-level userId checks." |
| Webhook signatures | **Pass** | "HMAC-SHA256 (Stripe), Svix (Clerk), timing-safe (cron)." |
| Rate limiting | **Pass** | "Comprehensive, fail-closed, Postgres-backed." |
| XSS protection | **Pass** | "Sanitized markdown, no `dangerouslySetInnerHTML`, defense-in-depth." |
| IDOR protection | **Pass** | "All user-scoped queries validate ownership." |

---

## Recommended Execution Order

1. **Item 2** — Drop `timestamp` from health endpoint (5-minute fix, zero risk)
2. **Item 1 Phase 0** — Accept the corrected CSP model in this doc and record the desired ownership path: keep Clerk automatic CSP, move to Clerk strict mode, or own CSP manually
3. **Item 1 Phase 1** — If we want visibility first, enable Clerk `reportOnly` / `reportTo` in `proxy.ts` and add `report-uri` pointing to Sentry's Security Header endpoint
4. **Item 1 Phase 2** — If we want a stronger CSP, refactor `ClerkProvider` / `next-themes` for nonce support and run a strict-mode report-only rollout
5. **Item 1 Phase 3** — Promote the chosen policy to enforcing mode only after auth flows, theme initialization, Sentry reporting, and billing redirects are verified
6. **Item 3** — No action; re-evaluate if architecture changes

---

## Definition of Done

- [x] Health endpoint no longer returns `timestamp` to unauthenticated callers
- [x] This debt doc no longer misstates current CSP behavior
- [x] A CSP ownership decision is recorded: Clerk automatic, Clerk strict mode, or manual CSP
- [x] If report-only is used, `report-uri`, the CSP `report-to` directive, and `Reporting-Endpoints` are wired to Sentry's Security Header endpoint; add legacy `Report-To` too if we want Sentry's widest compatibility path
- [x] If strict mode is chosen, `ClerkProvider` and `next-themes` nonce requirements are implemented and validated
- [x] Clerk auth flows, theme initialization, Sentry reporting, and deployed header behavior are verified under the chosen policy — deployed verification on 2026-03-21 confirmed zero CSP violations across both `addictionboards.com` (production) and `naltrexone-university-git-dev-john-h-jungs-projects.vercel.app` (dev). Auth sign-out/sign-in via Clerk+Google, theme toggle, protected-route/paywall flows, and the health endpoint passed clean. Billing (Stripe Checkout / Billing Portal) was **not** exercised end-to-end in deployed verification; despite the current server-side redirect architecture and lack of client-side Stripe assets, Subscribe and Manage Billing still must be clicked in report-only before enforcing because browser handling of `form-action 'self'` across post-submit redirects is inconsistent.
- [ ] Enforcing CSP is enabled or the accepted residual risk of Clerk automatic defaults is explicitly documented — before flipping, exercise Subscribe and Manage Billing flows in a browser and check for `form-action 'self'` violations (see gotcha #5)
