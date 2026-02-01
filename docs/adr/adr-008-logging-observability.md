# ADR-008: Logging and Observability Strategy

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers), ADR-006 (Error Handling)

---

## Context

We need production-grade observability for a subscription SaaS while minimizing risk:

- Logs must be searchable and machine-parseable (structured)
- Logs must not leak PII/secrets (security + privacy)
- Logs must support correlation (request-scoped identifiers)
- Logging must respect Clean Architecture (domain has zero logging imports)

---

## Decision

### Structured Logging

We log structured JSON to stdout (Vercel-compatible). We standardize on **Pino** for performance and structured output.

**Implementation location (framework layer):**

- `lib/logger.ts` exports a configured Pino logger.
- `lib/request-context.ts` provides request-scoped context (at minimum `requestId`), so logs can be correlated across a single request/action.

Controllers and route handlers emit logs with:

- `requestId`
- `userId` (internal UUID only; never email)
- `action` / `route`
- `durationMs`
- `errorCode` (when applicable)

**Request ID rules:**

- Generate `requestId` at the entry point (route handler or server action) using `crypto.randomUUID()`.
- Include `requestId` on every log line emitted while handling that request/action (directly or via a child logger).

### Redaction Rules

Never log:

- passwords, tokens, API keys, headers, cookies
- Stripe secrets/webhook signatures
- raw request bodies (especially webhooks)
- user emails (use internal `userId` instead)

### Layer Rules

- **Domain:** no logging imports, no side effects.
- **Application/use cases:** logging is optional; if used, depend on a logging port (interface) rather than a concrete logger.
- **Adapters/frameworks:** primary logging location (controllers, route handlers).

---

## Consequences

### Positive

- Debuggable production incidents with correlation IDs
- Security-by-default posture via redaction + discipline

### Negative

- Some boilerplate around request context and sanitization

### Mitigations

- Centralize logger creation + helpers in `lib/` (framework layer)

---

## Compliance Checklist

- [ ] No PII in logs (emails, names)
- [ ] No secrets in logs (keys, tokens, signatures)
- [ ] Domain layer has zero logging imports
- [ ] Controllers include `requestId` + `userId` when available
