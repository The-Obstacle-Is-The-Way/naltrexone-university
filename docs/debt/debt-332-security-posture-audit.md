# DEBT-332: Security Posture Audit — CSP Gap, Health Endpoint Disclosure, Hardening Opportunities

**Priority:** P2
**Created:** 2026-03-21
**Source:** Deep security audit prompted by Delve/Supabase public-bucket incident
**Related:** [ADR-009 Security Hardening](../adr/adr-009-security-hardening.md), [SPEC-017 Rate Limiting](../specs/spec-017-rate-limiting.md), [next.config.ts](../../next.config.ts), [proxy.ts](../../proxy.ts)

---

## Context

A third-party compliance company (Delve) was exposed for having a publicly accessible Supabase storage bucket leaking employee PII, session tokens, and equity documents — despite selling SOC 2 compliance to 1,500 companies. This prompted a from-first-principles audit of our own Neon/Postgres/Vercel stack.

**Overall finding: no critical vulnerabilities.** The architecture is fundamentally sound — database access is server-only, auth is enforced at every layer, webhooks verify signatures, rate limiting is comprehensive. However, a rigorous security review surfaces three items that best-practice-first engineers (or a real SOC 2 auditor) would flag.

---

## Item 1: No Global Content-Security-Policy Header (HIGH)

### The Problem

There is no global `Content-Security-Policy` (CSP) header. CSP directives are only applied through Clerk middleware (`proxy.ts:128-130`), which means:

1. **Public/unauthenticated routes have zero CSP protection.** The landing page (`/`), pricing page (`/pricing`), and Clerk auth pages receive no CSP header at all.
2. **Even Clerk-protected routes have an incomplete CSP.** The `CLERK_CSP_DIRECTIVES` object (`proxy.ts:29-40`) defines `base-uri`, `connect-src`, `font-src`, `frame-ancestors`, `img-src`, and `object-src` — but omits the most critical directives: `default-src`, `script-src`, and `style-src`.

### Why This Matters

CSP is the single most effective defense against XSS after output encoding. Without `script-src`, a browser will execute any injected `<script>` tag. Our markdown sanitization (`skipHtml={true}` + `rehype-sanitize`) makes XSS via question content extremely unlikely, but CSP is a defense-in-depth layer — it catches the cases your other defenses miss. Every major security framework (OWASP, CIS, NIST) recommends CSP.

Without it, a compromised third-party script (Clerk JS, Sentry JS, Stripe JS, analytics) could execute arbitrary code with no browser-level constraint.

### Current State

```
next.config.ts headers:     ✅ X-Content-Type-Options, Referrer-Policy, X-Frame-Options,
                              Permissions-Policy, Strict-Transport-Security
                            ❌ Content-Security-Policy (MISSING)

proxy.ts Clerk middleware:   Partial CSP (no default-src, no script-src, no style-src)
                            Only applied to Clerk-handled routes
```

### Stack-Specific CSP Requirements (Researched)

Each third-party service in our stack requires specific CSP directives. These were researched from official docs (Clerk CSP guide, Stripe security guide, Sentry CSP docs, Next.js CSP guide).

#### Clerk (clerk.com/docs/security/clerk-csp)

| Directive | Required Values | Why |
|---|---|---|
| `script-src` | `'unsafe-inline'` or nonce+`'strict-dynamic'`, FAPI hostname, `https://challenges.cloudflare.com` | Auth bootstrapping, bot protection (Turnstile) |
| `style-src` | **`'unsafe-inline'` (REQUIRED, no alternative)** | Clerk uses runtime CSS-in-JS for component styling; no nonce support for styles |
| `connect-src` | FAPI hostname | API calls for session management, token refresh |
| `img-src` | `https://img.clerk.com` | User avatars, organization logos |
| `frame-src` | `https://challenges.cloudflare.com` | Cloudflare Turnstile bot protection iframe |
| `worker-src` | `'self' blob:` | Web Workers for performance |

**FAPI hostname:** Decoded from our Clerk publishable key → `infinite-jaguar-35.clerk.accounts.dev` (dev). Production with custom domain → `clerk.{production-domain}.com`.

**Critical constraint:** `style-src 'unsafe-inline'` is non-negotiable with Clerk. Their CSS-in-JS has no nonce support. This is the single biggest CSP weakening and it's entirely on Clerk's side.

**Two CSP modes available:**
- **Default mode:** `script-src` includes `'unsafe-inline'` — simpler, weaker
- **Strict mode** (`contentSecurityPolicy: { strict: true }`): Per-request nonces + `'strict-dynamic'` — eliminates `'unsafe-inline'` from `script-src` only. Clerk generates nonces via `crypto.getRandomValues()` and Next.js auto-propagates them to framework `<script>` tags.

#### Stripe (docs.stripe.com/security/guide)

| Directive | Required Values | Why |
|---|---|---|
| `script-src` | `https://js.stripe.com`, `https://checkout.stripe.com` | Stripe.js library, Checkout redirect page |
| `connect-src` | `https://api.stripe.com`, `https://checkout.stripe.com` | Payment API calls, Checkout session |
| `frame-src` | `https://js.stripe.com`, `https://hooks.stripe.com`, `https://checkout.stripe.com` | Payment element iframes, 3D Secure, Checkout |
| `img-src` | `https://*.stripe.com` | Product images in Checkout |

**No `'unsafe-inline'` or `'unsafe-eval'` required.** Stripe is CSP-friendly.

**Not needed for us:** `https://maps.googleapis.com` (only for Stripe Address Element, which we don't use), `https://q.stripe.com` (telemetry — can be safely blocked with no functional impact).

#### Sentry (@sentry/nextjs, bundled)

| Directive | Required Values | Why |
|---|---|---|
| `script-src` | Nothing extra (`'self'` covers it) | SDK is bundled by Next.js, not loaded from CDN |
| `connect-src` | `https://*.ingest.us.sentry.io` | Error/performance data ingest endpoint |
| `worker-src` | Not needed | Session Replay is disabled (`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0` in `sentry.client.config.ts`) |

**Bonus:** Sentry can natively receive CSP violation reports. Set `report-uri` to `https://o{ORG}.ingest.us.sentry.io/api/{PROJECT}/security/?sentry_key={KEY}` (from Sentry Project Settings → Security Headers). This creates CSP violation issues in Sentry automatically — perfect for the report-only rollout phase.

#### Next.js (App Router)

| Directive | Required Values | Why |
|---|---|---|
| `script-src` | `'self'` + `'unsafe-inline'` (or nonce) | Next.js injects inline scripts for React hydration |
| `style-src` | `'self'` + `'unsafe-inline'` | Inline style injection during development and potentially production |
| Dev only | `'unsafe-eval'` in `script-src` | React uses `eval()` for enhanced error stacks in dev; NOT needed in production |

**Nonce propagation:** Next.js 13.4.20+ automatically extracts the nonce from the `Content-Security-Policy` header's `script-src` directive and attaches it to all framework-generated `<script>` tags. No manual threading needed.

### Implementation Architecture

**Where to set CSP:** In `proxy.ts` via Clerk's `contentSecurityPolicy` option — NOT in `next.config.ts`.

Rationale:
- Clerk middleware already generates CSP and merges custom directives — doing it in `next.config.ts` would create two competing CSP headers
- `proxy.ts` runs per-request, enabling nonce generation if we upgrade to strict mode later
- `next.config.ts` headers are static (set at build time) — cannot support nonces
- All routes (including public) pass through the proxy matcher, so CSP covers everything

**What to change in `proxy.ts`:**
1. Expand `CLERK_CSP_DIRECTIVES` to include `default-src`, `script-src`, `style-src`, `frame-src`, `form-action`, and `upgrade-insecure-requests`
2. Clerk's middleware merges these with its own required domains (FAPI hostname, Cloudflare challenges)

### Combined CSP Policy

This is the researched, stack-verified policy covering Clerk + Stripe + Sentry + Next.js:

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://js.stripe.com https://checkout.stripe.com https://challenges.cloudflare.com;
style-src 'self' 'unsafe-inline';
connect-src 'self' ws: wss: https://api.stripe.com https://checkout.stripe.com https://*.ingest.us.sentry.io;
img-src 'self' data: blob: https: https://img.clerk.com;
font-src 'self' data: https:;
frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://challenges.cloudflare.com;
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
upgrade-insecure-requests;
```

**Notes on this policy:**
- `'unsafe-inline'` in `style-src` — required by Clerk (CSS-in-JS, no nonce support)
- `'unsafe-inline'` in `script-src` — the easy-path choice; can be upgraded to nonce + `'strict-dynamic'` via Clerk's `strict: true` mode in a future pass
- `ws: wss:` in `connect-src` — required for Next.js hot reload (dev) and Clerk's real-time session updates
- Clerk's middleware auto-adds the FAPI hostname to `script-src` and `connect-src`, so it's not listed here explicitly
- `https:` in `img-src` — broad but necessary; Clerk avatars, Stripe product images, and markdown-embedded images can come from arbitrary HTTPS origins
- `upgrade-insecure-requests` — forces HTTPS for all subresources (aligns with HSTS already in `next.config.ts`)
- Dev mode: add `'unsafe-eval'` to `script-src` conditionally (`process.env.NODE_ENV === 'development'`)

### Rollout Plan (Three Phases)

#### Phase 1: Report-Only (Zero Risk)

Deploy the policy as `Content-Security-Policy-Report-Only` with `report-uri` pointing to Sentry's CSP endpoint. Browsers log violations but block nothing. The site works exactly as before.

**How:** Clerk's `contentSecurityPolicy` option may not support report-only mode directly. If not, manually set the `Content-Security-Policy-Report-Only` header on the response object in `proxy.ts` after Clerk middleware runs.

**Duration:** 1-2 weeks in production.

**Monitor:** Check Sentry for CSP violation events. Each violation shows the blocked URI, the violated directive, and the page URL — enough to identify missing domains.

#### Phase 2: Refine

Adjust directives based on violation reports. Common surprises:
- Clerk FAPI hostname not matching (dev vs production)
- Third-party images blocked by `img-src`
- WebSocket connections blocked by `connect-src`

#### Phase 3: Enforce

Switch from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. Optionally keep a report-only header with a *stricter* experimental policy (e.g., nonce-based) alongside the enforcing one.

### Future Enhancement: Strict Mode (Nonce-Based)

After the `'unsafe-inline'` policy is stable, upgrade `script-src` to nonce-based:

1. Set `contentSecurityPolicy: { strict: true }` in Clerk middleware config
2. Clerk generates per-request nonces and adds `'strict-dynamic'` + `'nonce-{value}'` to `script-src`
3. Next.js auto-propagates the nonce to all framework `<script>` tags
4. `'unsafe-inline'` in `script-src` becomes a no-op (ignored when nonce is present) — can be removed
5. `style-src 'unsafe-inline'` remains (Clerk limitation, no workaround)

This eliminates the `'unsafe-inline'` weakness for scripts while keeping styles as-is. It's a meaningful security upgrade but not urgent — the domain-restricted policy above is already a strong improvement over no CSP.

### Effort Estimate

- Implementation: Small (expand `CLERK_CSP_DIRECTIVES` in `proxy.ts`)
- Testing/rollout: Medium (report-only phase, verify Clerk sign-in/sign-up, Stripe checkout, Sentry reporting)
- Risk if skipped: An XSS via a compromised third-party CDN or a future code regression would have no browser-level mitigation

---

## Item 2: Health Endpoint Discloses DB Liveness (LOW)

### The Problem

`GET /api/health` returns `{ ok: true, db: true, timestamp: "..." }` to any unauthenticated caller. This tells the world:
- Whether the application is up
- Whether the database is reachable
- The server's clock (useful for timing attacks against rate-limit windows)

**File:** `app/api/health/handler.ts:55-58`

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
| No global CSP | **Medium** | "Implement CSP with report-only rollout. Required for compliance." |
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
2. **Item 1 Phase 1** — Expand `CLERK_CSP_DIRECTIVES` in `proxy.ts` with the combined policy above; deploy as `Content-Security-Policy-Report-Only`; point `report-uri` at Sentry CSP endpoint
3. **Item 1 Phase 2** — Monitor Sentry for CSP violations for 1-2 weeks; fix any missing domains
4. **Item 1 Phase 3** — Promote to enforcing `Content-Security-Policy`
5. **Item 1 Future** — Upgrade to nonce-based `script-src` via Clerk's `strict: true` mode
6. **Item 3** — No action; re-evaluate if architecture changes

---

## Definition of Done

- [ ] Health endpoint no longer returns `timestamp` to unauthenticated callers
- [ ] `CLERK_CSP_DIRECTIVES` in `proxy.ts` expanded with `default-src`, `script-src`, `style-src`, `frame-src`, `form-action`, `upgrade-insecure-requests`
- [ ] CSP deployed as `Content-Security-Policy-Report-Only` in production
- [ ] `report-uri` pointing to Sentry CSP endpoint for violation monitoring
- [ ] CSP violations monitored for 1-2 weeks with no false positives
- [ ] All Clerk auth flows (sign-in, sign-up, user button), Stripe checkout, and Sentry error reporting verified under the policy
- [ ] Promoted to enforcing `Content-Security-Policy`
