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

- Interface: `docs/_archive/specs/spec-004-application-ports.md`
- Implementation guidance: `docs/_archive/specs/spec-008-auth-gateway.md`

`AuthGateway` returns a domain `User` with internal UUID + email only.

**Amendment 2026-10-07 (DEBT-503 item 1): where identity and email come from.**
- **Identity.** The Clerk user ID comes from the session the middleware verified (`auth()`). The app reads its own `users` row by that ID, and the deletion tombstone, on every request. It calls Clerk's Backend API only to provision a missing row, through the unchanged provisioning rules.
- **Email.** The `users` row's email is kept current by Clerk's `user.updated` webhook. Stripe checkout and trial card setup, which send it to Stripe, refresh it from Clerk first (`requireUser({ currentEmail: true })`).
- **Claims.** Token claims never provision a user.

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

