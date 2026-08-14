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

The keyed request path remains the cleanup owner: before claiming a key,
`withIdempotency` invokes `pruneExpiredBefore` as best-effort, warn-visible,
fail-open work. The repository performs that prune as one bounded statement:
a `WITH candidates` selection ordered by `expires_at` and the composite primary
key, `FOR UPDATE SKIP LOCKED`, followed by `DELETE ... USING candidates ...
RETURNING`. The delete joins on `(user_id, action, key)` and retains the
`expires_at < cutoff` guard. The prune method does not open an explicit
select-then-delete transaction.

### 3. Client-Side Key Generation

Controllers accept an optional `idempotencyKey` (UUID) from the client when replaying the prior successful result is semantically correct for that operation. For duplicate-sensitive actions such as practice session start, answer submission, bookmark toggle, and checkout creation, the UI generates a client UUID for the logical action and reuses it on retry. This ensures:
- First request claims the key and executes.
- Retries with the same key receive the cached result.
- A new logical action gets a new key.

Short-lived redirect/session artifacts are the important exception. Stripe Billing Portal sessions are intentionally created on demand by the default manage-billing UI, which omits an idempotency key. Replaying a cached portal URL after Stripe's short validity window is incorrect, so portal-session idempotency remains an explicit opt-in for callers that truly need retry coordination.

### 4. Stripe Forwarding

When a controller elects to use an idempotency key, adapters forward it to Stripe via `PaymentGatewayRequestOptions.idempotencyKey`, ensuring both our DB and Stripe see the same deduplication key. Adapters must not invent deterministic fallback keys for operations where replaying a prior short-lived redirect/session URL would be semantically wrong.

**Amendment (2026-08-14 — [DEBT-466](../debt/debt-466-checkout-idempotency-replay-chain-exhaustion.md)):** the default rule above and the Billing Portal example remain binding. BUG-245's subscription Checkout path is one deliberate, bounded exception: its caller UUID remains application-level idempotency while the Stripe adapter derives a deterministic provider key to collapse concurrent same-plan creates. That exception is licensed only while all of these conditions remain true:

- every created or replayed subscription Checkout Session is retrieved after create so the adapter decides from live status rather than the saved create body;
- terminal live Sessions traverse a named, bounded recovery ladder;
- trial variants remain scoped by `:trial:{days}`; and
- changed create parameters recover through a request-fingerprint key rather than silently reusing mismatched parameters.

The exception does **not** extend to the trial-payment-method setup path as currently implemented. A 2026-08-14 test-mode probe created an `open` setup Session, expired it, and then observed same-key create replay return the saved `open` body and URL while live retrieve returned `expired`. Because that path does not retrieve after create, its deterministic key can replay a stale URL; this separate defect must be resolved on its own merits rather than treating BUG-245 as general permission for deterministic short-lived redirect keys. It is tracked as [DEBT-467](../debt/debt-467-trial-setup-checkout-stale-session-url-replay.md), whose fix design brings the setup path up to these same license conditions before a follow-up amendment extends the exception.

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
- `tests/integration/idempotency-key-repository.integration.test.ts` verifies the Postgres idempotency repository behavior end-to-end (`DrizzleIdempotencyKeyRepository`).
- Controllers that accept `idempotencyKey` are documented in `docs/specs/master_spec.md`.

---

## References

- `src/application/ports/idempotency-key-repository.ts` — Port interface
- `src/adapters/shared/with-idempotency.ts` — Wrapper implementation
- `src/adapters/repositories/drizzle-idempotency-key-repository.ts` — Postgres implementation
- `db/schema.ts` — `idempotency_keys` table
- ADR-005 (Payment Boundary) — Stripe idempotency key forwarding
- ADR-006 (Error Handling Strategy) — Error code propagation through cached errors
- Stripe Docs — Billing Portal sessions: https://docs.stripe.com/customer-management/integrate-customer-portal
- Stripe Docs — Idempotent requests: https://docs.stripe.com/api/idempotent_requests
