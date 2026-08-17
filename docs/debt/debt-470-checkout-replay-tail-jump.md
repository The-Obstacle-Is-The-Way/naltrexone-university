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

The 2026-08-17 adversarial audit settles a **constant healthy-path recovery-create-depth tail jump**, not another cap increase. Stripe's pagination contract says list objects are reverse chronological (newest first), `has_more` marks omitted objects, and `starting_after` advances the cursor; the Checkout Sessions endpoint accepts at most 100 rows per page but cannot filter by metadata. The installed `stripe@22.4.0` SDK exposes those fields and cursor parameters. A read-only TEST-mode probe then observed the documented order and cursor behavior: the first 100 customer Sessions were non-increasing by `created`, `has_more` was true, the next five-row cursor page loaded, and 30 rows in that first page matched the current monthly `trial:7` tuple. The newest match was terminal and was the only match at its creation second. No key or identifier was printed.

1. Keep the existing open-Session preflight and deterministic primary create/live-retrieve. Only when that result is terminal, scan Checkout Sessions for this customer in reverse-chronological pages of 25, stopping after four pages (100 Sessions). “Match” means `mode === 'subscription'` plus equality with **all eleven** fields produced by `checkoutRenewalMetadata()` — variant, user, plan, amount, currency, frequency, disclosure snapshot/version, terms version/hash, and cancellation method — not merely `(user, plan, variant)`. Missing legacy metadata is not a match.
2. The first matching creation second is the newest matching second by Stripe's ordering guarantee. Continue only far enough to cross that second, including a cursor page when the second straddles a boundary. Use the candidate only when exactly one matching Session exists at that second and it has a recognized live status. If no match appears within four pages, list fails, pagination cannot advance, a required field is absent, or multiple matching Sessions share that newest second, log the reason and retain the primary result; the existing deterministic bounded walk remains the safe fallback. This avoids inventing a causal order from Stripe IDs, whose tie ordering is not documented.
3. When the unique newest match is `open`, live-retrieve it under the existing subscription `fallback-to-created` policy before reconciliation; if it is still open, reuse it without a recovery create. When it is `complete` or `expired`, seed the existing loop from that terminal Session and derive the first recovery key exactly as today: `checkout_session_recovery:{userId}:{plan}:{tailSessionId}[:trial:{days}]`. The ordinary retained-chain path therefore performs one tail-list page and one recovery create/live-retrieve instead of walking every older key.
4. Do not create a new tail-key namespace. Reusing the existing `f(sessionId)` shape is intentional convergence, not an accidental collision: a pre-deploy server walking the chain eventually requests the same key a post-deploy server jumps to, with the same current params. Stripe's saved-response contract then collapses both requests. The `request:{fingerprint}` namespace remains disjoint, and `:trial:{days}` remains part of both ordinary recovery shapes. If params outside renewal metadata changed, Stripe's mismatch error continues through the existing deterministic request-fingerprint recovery.
5. Two same-input calls that observe the same unique tail derive the same key. If one has already created the next open Session when the other scans, that open Session is the newest exact match and is live-retrieved/reused; if the second scan predates it, both request `f(tail)` and Stripe collapses them. An equal-second ambiguity, incomplete scan, or provider failure never chooses between competing IDs: it falls back to the common deterministic primary result. Existing post-create open-Session reconciliation remains the defense for different-plan/parameter races. Setup Checkout is out of scope and keeps `TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT` and `require-verified-status` unchanged.
6. `SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT = 10` still bounds **recovery creates after the primary**, now starting from the proven listed tail when available. A stale list or a recovery response that has already become terminal can therefore advance at most ten deterministic rungs; the adapter still throws before recovery create 11. Low-depth warns and depth ≥ 5 errors remain. The jump removes retained-chain-length work from the normal exact-metadata path without pretending the provider scan or fallback is unboundedly safe.
7. Extend `FakeStripeCheckoutClient` before the adapter change: list all live statuses with reverse-chronological cursor pagination, freeze same-key/same-params responses, and raise Stripe-shaped idempotency mismatch errors for same-key/different-params creates. Contract tests must pin those provider semantics. Adapter tests then cover more than 10 retained terminal Sessions, exact metadata filtering, pagination, equal-second ambiguity, missing legacy metadata, an already-open newest match, list/retrieve failures, concurrent calls, mixed-version key convergence, mismatch recovery, and the exact fallback limit.

The scan bound is execution-derived. Five read-only 25-row list samples measured 436.6 ms median / 624.6 ms maximum; 10, 50, and 100 rows measured 334.9, 946.4, and 2,014.0 ms medians respectively. Under the repository's third-attempt-success envelope, one 25-row page budgets `3×436.6 + 300 = 1,609.8 ms`; one page plus the recorded create/retrieve rung budgets `1,609.8 + 1,259.1 = 2,868.9 ms`. The pathological four-page scan plus the existing primary-and-ten-rung fallback budgets `4×1,609.8 + 13,850 = 20,289.2 ms`, leaving 9.711 seconds of the pricing route's 30-second `maxDuration` for subscription/open-Session checks, reconciliation, application work, and variance. As before, this is a healthy-service planning budget, not a hard timeout: the SDK's 80-second transport timeout remains independently larger.

On the common saturated-chain path, the whole Checkout-session sequence has three list calls (existing-open preflight, one tail page, post-create reconciliation), two creates (primary replay plus `f(tail)`), and two live retrieves; the tail-jump slice itself is one list + one create + one retrieve. The local capacity preflight and its `[E2E_CHECKOUT_CHAIN_SATURATED]` gate exception retire only when this implementation lands and the retained-chain E2E passes; until then they remain the pre-change diagnostic.

## Verification

- [x] Execution audit proves documented list ordering/pagination and observes tail selection against Stripe TEST mode without exposing keys or identifiers
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
