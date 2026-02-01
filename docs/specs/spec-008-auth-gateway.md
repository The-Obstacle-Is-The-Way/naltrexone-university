# SPEC-008: Auth Gateway (Clerk)

**Status:** Ready
**Layer:** Adapters
**Dependencies:** SPEC-004 (Ports), SPEC-006 (Drizzle Schema)
**Implements:** ADR-004 (Authentication Boundary)

---

## Objective

Implement `AuthGateway` using Clerk while keeping the domain and application layers vendor-neutral.

Key requirement:

- **Domain `User` has no Clerk identifier.**
- Clerk user id (`users.clerk_user_id`) lives only in persistence.

---

## Files to Create

```
src/adapters/gateways/
├── clerk-auth-gateway.ts
└── index.ts
```

---

## Behavior (Required)

`ClerkAuthGateway` MUST:

1. Read the current Clerk session (`auth()` / `currentUser()`)
2. Ensure a local `users` row exists (upsert by `clerk_user_id`)
3. Return a **domain** `User` containing:
   - `id` (internal UUID)
   - `email`
   - `createdAt`, `updatedAt`

If not authenticated:

- `getCurrentUser()` returns `null`
- `requireUser()` throws `ApplicationError('UNAUTHENTICATED')`

---

## Testing

AuthGateway tests are **unit tests**:

- No database
- No Clerk network calls
- Inject a fake auth context and fake persistence port (or in-memory store)

The goal is to verify:

- Correct behavior for authenticated vs unauthenticated
- Correct user creation/upsert behavior at the adapter boundary

---

## Notes

Route protection is implemented at the framework layer via `proxy.ts` (Next.js 16 “Proxy” file convention), not inside the domain/application layers.

