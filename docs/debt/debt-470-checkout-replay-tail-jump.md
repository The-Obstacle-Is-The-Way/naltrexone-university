# DEBT-470: Checkout Replay Traversal Needs a Constant-Depth Tail Jump

**Status:** Open
**Priority:** P3
**Date:** 2026-08-17
**Source:** DEBT-466 residual-cap execution audit: a local campaign burst retained 11 completed `(user, monthly, trial:7)` Checkout Sessions and exhausted `SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT = 10`.

---

## Description

`createStripeCheckoutSession()` uses deterministic provider keys to preserve BUG-245 concurrency collapse. After the primary create, it retrieves live Session state. For every terminal result it derives the next key from that Session ID — `checkout_session_recovery:{userId}:{plan}:{staleSessionId}[:trial:{days}]` — then creates and retrieves again. The loop permits 10 recovery creates. Its exact boundary test proves that primary plus all 10 recoveries terminal throws before recovery create 11.

Part A correctly raised the old limit from 3 to a measured 10 without weakening determinism, but it did not remove the structural property: reaching the newest retained Session requires one create/retrieve rung per older retained Session. The 2026-08-17 reproduction traversed completed recovery attempts 1→10 and threw; a read-only current-tuple census found 11 completed Sessions created less than 24 hours earlier. The current test-infrastructure preflight now identifies this condition without a generic redirect, but diagnosis is not a production fix.

## Impact

- Burst local gates can fill any fixed traversal bound while Stripe still retains the deterministic keys, producing an environmental `trial-start` red until pruning occurs.
- The same bounded production edge remains possible through repeated same-tuple subscribe→lose-subscription→resubscribe cycles.
- Healthy retained replays spend one create plus one live retrieve per rung, so latency and log volume grow with chain depth before the hard failure.

## Resolution

Design and execution require a separate adversarial audit. The intended direction is a **constant recovery-create-depth tail jump**, not another cap increase:

1. After a terminal primary result, list the customer's recent Checkout Sessions and identify the newest Session that matches the exact current `(user, plan, variant)` renewal metadata and is terminal by live state.
2. Derive the first recovery key from that newest matching Session ID, then create and live-retrieve once under the existing recovery-key shape. If the listed Session is the retained chain tail, this asks for `f(tail)` directly instead of replaying `f(primary)`, `f(second)`, and every intervening rung.
3. Preserve BUG-245 deterministic primary/recovery key shapes, two-tab concurrency collapse, application-only caller-key ownership, `:trial:{days}` scoping, request-fingerprint mismatch recovery, live post-create retrieval, open-Session reconciliation, and fail-closed inactive handling.
4. Before implementation, prove Stripe list ordering, pagination, metadata completeness, and concurrent-create behavior against the installed SDK and official API; do not assume the first returned row is the causal tail. Specify the safe behavior when no unique newest matching tail can be proven.
5. Extend the replay-faithful Stripe fake before using it for this work. Add red tests for chains above 10, mixed users/plans/variants, equal timestamps, missing legacy metadata, pagination, a concurrently created newer Session, list/retrieve failures, and exact preservation of every pinned contract.
6. Re-measure the list + create + retrieve healthy-service budget against the pricing route's 30-second `maxDuration` and retain explicit depth/error logging for any fallback path.

“Constant depth” here means a bounded number of recovery **create/retrieve rungs** after the tail lookup. A provider list can still paginate with the number of Sessions; the audit must measure and bound that separately rather than calling the whole operation asymptotically O(1).

## Verification

- [ ] Execution audit proves list ordering/pagination and tail selection against Stripe TEST mode without exposing keys or identifiers
- [ ] Provider-faithful red test with more than 10 retained terminal Sessions succeeds after the implementation with constant recovery-create depth
- [ ] Mixed-tuple, concurrency, legacy-metadata, pagination, ambiguity, and provider-failure tests pin safe behavior
- [ ] Existing DEBT-466/BUG-245 contracts remain byte-for-byte key-compatible and green
- [ ] Measured worst-case planning budget remains inside the 30-second pricing route budget with documented headroom
- [ ] Local `trial-start` passes against a previously cap-saturating retained chain; the diagnostic preflight remains as an environment receipt, not a skip

## Related

- [DEBT-466](./debt-466-checkout-idempotency-replay-chain-exhaustion.md) — settled finite-bound implementation and 2026-08-17 saturation receipt
- [BUG-245](../_archive/bugs/bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) — deterministic key and concurrency-collapse contract
- [ADR-015 §4](../adr/adr-015-idempotency-strategy.md) — conditioned deterministic Checkout exception
- [DEBT-386](../_archive/debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md) — why test identity/customer rotation is not the fix
