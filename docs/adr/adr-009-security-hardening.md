# ADR-009: Security Hardening

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-004 (Auth Boundary), ADR-005 (Payment Boundary), ADR-006 (Error Handling)

---

## Context

This is a subscription-based medical education SaaS. We must protect:

- authenticated user data (email + usage)
- paid content (questions/explanations)
- billing flows (Stripe)

---

## Decision

We implement defense-in-depth controls aligned with OWASP principles.

### Authentication and Route Protection

- Route protection is enforced at the request layer via Clerk in `proxy.ts`.
- Deny-by-default: only explicitly listed public routes are unauthenticated.

### Authorization and Entitlement

- All “subscribed” features must enforce entitlement server-side.
- Entitlement source of truth: `stripe_subscriptions` state (see `docs/specs/master_spec.md` Section 4.2).

### Input Validation

- All controller inputs are validated with Zod at the boundary (`.strict()`).
- Controllers accept `unknown` and return `ActionResult<T>` (no stack traces to clients).

### Webhook Security

- Stripe webhooks MUST verify signatures via `stripe.webhooks.constructEvent(...)`.
- Webhook route MUST run in Node runtime (not Edge).
- Webhook processing MUST be idempotent via `stripe_events` (see master spec Section 4.4.2).

### Data Access

- Use Drizzle parameterized queries; no string-interpolated SQL.
- Use least privilege: only the minimum DB operations required by each controller/use case.

### Secrets Management

- Secrets live only in environment variables.
- `.env` is never committed (enforced by `.gitignore`).
- CI uses GitHub Actions secrets; production uses Vercel environment variables.

### Logging Safety

- Follow ADR-008: no secrets/PII in logs; use internal IDs only.

---

## Consequences

### Positive

- Standard, auditable security posture
- Reduced risk of content leakage and billing abuse

### Negative

- More boundary code (validation + error mapping)

### Mitigations

- Centralize shared validation helpers and error mapping utilities in controllers (SPEC-010).

---

## References

- OWASP Top 10: https://owasp.org/Top10/
- Next.js production checklist: https://nextjs.org/docs/app/building-your-application/deploying/production-checklist
- Clerk security docs: https://clerk.com/docs/security
- Stripe webhook security: https://stripe.com/docs/webhooks
