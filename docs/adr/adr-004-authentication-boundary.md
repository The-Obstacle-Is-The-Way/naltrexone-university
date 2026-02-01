# ADR-004: Authentication Boundary

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers)

---

## Context

Authentication is a framework concern (outer layer). We must:

- Protect routes consistently
- Map external identity (Clerk) to internal users (UUIDs)
- Keep domain and application layers vendor-neutral

---

## Decision

### Boundary Placement

- Clerk lives in the **Frameworks** layer (`proxy.ts`, Clerk SDK).
- Domain entities have **no Clerk identifiers**.
- The only persisted link to Clerk is `users.clerk_user_id` (database layer).

### Auth Gateway

We expose authentication to the application layer via an `AuthGateway` interface (ports) implemented in adapters.

- Interface: `docs/specs/spec-004-application-ports.md`
- Implementation guidance: `docs/specs/spec-008-auth-gateway.md`

`AuthGateway` returns a domain `User` with internal UUID + email only.

### Route Protection

Route protection is enforced at the request layer:

- `proxy.ts` (Next.js 16 “Proxy” file convention) runs Clerk middleware
- Public routes are explicitly enumerated; everything else is protected

---

## Consequences

### Positive

- Auth provider is swappable (domain/use cases unaffected)
- Use cases receive clean `userId` inputs (no session/token concerns)

### Negative

- Requires mapping layer (Clerk → DB user row)

---

## Compliance Checklist

- [ ] No Clerk imports in `src/domain/**`
- [ ] No Clerk imports in `src/application/**`
- [ ] Domain `User` has no `clerkUserId` field
- [ ] `users.clerk_user_id` exists only in persistence
- [ ] Controllers use `AuthGateway` (not raw Clerk IDs)

