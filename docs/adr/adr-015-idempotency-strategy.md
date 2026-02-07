# ADR-015: Idempotency Strategy

**Status:** Accepted
**Date:** 2026-02-07
**Decision Makers:** Engineering
**Depends On:** ADR-001 (Clean Architecture Layers), ADR-006 (Error Handling Strategy), ADR-007 (Dependency Injection)

---

## Context

Several user-facing actions create external side effects that must not be duplicated:

- **Starting a practice session** allocates a question set and persists a session row.
- **Creating a checkout session** initiates a Stripe Checkout flow with a payment intent.
- **Submitting an answer** records an attempt and updates session state.

Network retries, double-clicks, and React Strict Mode re-renders can all cause the same logical action to fire more than once. Without idempotency, duplicates corrupt state (e.g., two sessions created for one click, two Stripe charges).

Stripe provides its own idempotency key mechanism for API calls, but our application also needs **application-level idempotency** to prevent duplicate use case execution regardless of which external service is involved.

---

## Decision

Implement a **claim-execute-store** idempotency pattern backed by a Postgres table, with the following components:

### 1. Port: `IdempotencyKeyRepository`

Defined in `src/application/ports/idempotency-key-repository.ts`. The interface provides:

- `claim(userId, action, key, expiresAt)` — Attempts to insert a row. Returns `true` if the caller "wins" the claim (should execute), `false` if a concurrent request already claimed it.
- `find(userId, action, key)` — Reads an existing record (returns `null` if expired or missing).
- `storeResult(userId, action, key, resultJson)` — Persists the successful result for replay.
- `storeError(userId, action, key, error)` — Persists the error for replay.
- `pruneExpiredBefore(cutoff, limit)` — Garbage collection for old keys.

The composite key is `(userId, action, key)` — scoped per-user, per-action, per client-provided idempotency key.

### 2. Wrapper: `withIdempotency<T>()`

Defined in `src/adapters/shared/with-idempotency.ts`. Orchestrates the full lifecycle:

```text
1. Attempt claim(key)
   ├── Claimed → execute() → storeResult() → return result
   │                └── on error → storeError() → throw
   └── Not claimed → poll for result
        ├── Result found → return cached result
        ├── Error found → throw cached error
        └── Timeout → throw CONFLICT
```

Configuration:
- **TTL:** 24 hours (default) — keys auto-expire.
- **Max wait:** 2 seconds — how long a duplicate request polls before timing out.
- **Poll interval:** 50ms — polling frequency for concurrent request resolution.

### 3. Client-Side Key Generation

Controllers accept an optional `idempotencyKey` (UUID) from the client. The UI generates a fresh UUID per user-initiated action and reuses it on retry. This ensures:
- First request claims the key and executes.
- Retries with the same key receive the cached result.
- New user actions generate new keys.

### 4. Stripe Forwarding

When the idempotency key is provided, adapters forward it to Stripe via `PaymentGatewayRequestOptions.idempotencyKey`, ensuring both our DB and Stripe see the same deduplication key.

---

## Consequences

### Positive

- **At-most-once execution** — Duplicate requests return cached results instead of re-executing.
- **Vendor-agnostic** — Works for any use case, not just Stripe operations.
- **Clean Architecture** — Port in application layer, implementation in adapters. Domain stays pure.
- **Error replay** — Failed operations cache their error, so retries see the same error without re-executing.
- **Self-cleaning** — TTL + `pruneExpiredBefore` prevent unbounded table growth.

### Negative

- **Extra DB round-trip** — Every idempotent action requires a claim query before execution.
- **Polling overhead** — Concurrent duplicate requests poll until result appears or timeout.
- **Serialized execution** — Only one request per key executes; others wait.

### Mitigations

- Claim uses `INSERT ... ON CONFLICT DO NOTHING` — single atomic operation.
- 50ms polling with 2-second timeout keeps overhead bounded.
- TTL ensures stale keys don't persist indefinitely.

---

## Compliance

- `src/adapters/shared/with-idempotency.test.ts` covers claim, replay, error replay, timeout, and concurrent scenarios.
- `src/adapters/controllers/practice-controller.test.ts`, `src/adapters/controllers/question-controller.test.ts`, and `src/adapters/controllers/billing-controller.test.ts` verify reused idempotency keys return cached results and do not re-execute use cases.
- `tests/integration/repositories.integration.test.ts` verifies the Postgres idempotency repository behavior end-to-end (`DrizzleIdempotencyKeyRepository`).
- Controllers that accept `idempotencyKey` are documented in `docs/specs/master_spec.md`.

---

## References

- `src/application/ports/idempotency-key-repository.ts` — Port interface
- `src/adapters/shared/with-idempotency.ts` — Wrapper implementation
- `src/adapters/repositories/drizzle-idempotency-key-repository.ts` — Postgres implementation
- `db/schema.ts` — `idempotency_keys` table
- ADR-005 (Payment Boundary) — Stripe idempotency key forwarding
- ADR-006 (Error Handling Strategy) — Error code propagation through cached errors
