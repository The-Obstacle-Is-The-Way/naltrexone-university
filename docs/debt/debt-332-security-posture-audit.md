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

There is no global `Content-Security-Policy` (CSP) header in `next.config.ts`. CSP directives are only applied through Clerk middleware (`proxy.ts:128-130`), which means:

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

### What "Fixed" Looks Like

A global CSP header in `next.config.ts` applied to `/:path*`, with at minimum:

```
default-src 'self';
script-src 'self' https://*.clerk.accounts.dev https://js.stripe.com https://*.sentry.io;
style-src 'self' 'unsafe-inline';
connect-src 'self' ws: wss: https://*.clerk.accounts.dev https://*.stripe.com <sentry-ingest-origin>;
img-src 'self' data: blob: https:;
font-src 'self' data: https:;
frame-src https://js.stripe.com;
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
```

**Complexity:** The hard part is not writing the header — it's testing it. CSP misconfiguration can break Clerk auth flows, Stripe checkout, and Sentry error reporting. This needs:
1. A `report-only` rollout first (`Content-Security-Policy-Report-Only`)
2. Testing across all auth flows (sign-in, sign-up, checkout, webhook callback pages)
3. Sentry CSP violation reporting (Sentry supports this natively)
4. Gradual promotion from report-only to enforcing

### Effort Estimate

- Implementation: Small (one header block in `next.config.ts` + merge with Clerk directives)
- Testing/rollout: Medium (verify Clerk, Stripe, Sentry all work under the policy)
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
2. **Item 1** — Add global CSP in `report-only` mode, monitor for violations, then enforce (multi-session effort, needs careful testing)
3. **Item 3** — No action; re-evaluate if architecture changes

---

## Definition of Done

- [ ] Health endpoint no longer returns `timestamp` to unauthenticated callers
- [ ] Global `Content-Security-Policy-Report-Only` header deployed to production
- [ ] CSP violations monitored (Sentry CSP reporting or similar)
- [ ] After burn-in period with no false positives, promote to enforcing `Content-Security-Policy`
- [ ] All Clerk auth flows, Stripe checkout, and Sentry reporting verified under enforcing CSP
