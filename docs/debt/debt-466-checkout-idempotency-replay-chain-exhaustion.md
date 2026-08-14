# DEBT-466: Checkout Idempotency Replay-Chain Exhaustion (Subscription Recovery Bound Stops Traversal)

**Status:** Open
**Priority:** P3
**Date:** 2026-08-13
**Source:** Live diagnosis of repeated `trial-start.spec.ts` E2E failures on 2026-08-13 (server-log signature captured), reverified by a read-only Stripe test-mode census on 2026-08-14, plus a design-history sweep of the checkout idempotency arc (BUG-148 → DEBT-305 → DEBT-410 §B.11 item 8 → BUG-245 → DEBT-414 H10).
**Scope:** `createStripeCheckoutSession` and `createStripeTrialPaymentMethodSetupSession` in `src/adapters/gateways/stripe/stripe-checkout-sessions.ts` share `CHECKOUT_SESSION_RECOVERY_ATTEMPT_LIMIT = 3` (line 25 — no comment or documented rationale). The subscription exhaustion test derives its call count from the constant; the setup exhaustion test hardcodes four calls and recovery attempts 1, 2, and 3. The live defect is verified in the subscription ladder. Applying the same replay-chain fix to the setup ladder requires owner re-review because that ladder does not retrieve live Session state after create.

---

## Description

The checkout gateway creates Stripe Checkout Sessions under a **deterministic** primary idempotency key — `checkout_session:{userId}:{plan}[:trial:{days}]` — a load-bearing BUG-245 decision that collapses concurrent same-plan creates so two tabs cannot double-bill. ADR-015 §4 does not license that later exception: it still says adapters must not invent deterministic fallback keys for short-lived redirect artifacts, so the accepted ADR and current BUG-245 implementation are out of sync. [Stripe's idempotency documentation](https://docs.stripe.com/api/idempotent_requests) says it saves the first request's status code and body, returns that same result on reuse, and can prune keys only after they are **at least 24 hours old**; it does not promise an exact 24-hour expiry. The repo's Stripe vendor doc currently contains no idempotency section.

The subscription path creates and then retrieves the Session. If that merged live snapshot is **inactive** (`isSessionInactive`: a present `status` is not `open`, or `expires_at` is at or before `nowMs()`), it retries under `checkout_session_recovery:{userId}:{plan}:{staleSessionId}[:trial:{days}]`, up to `CHECKOUT_SESSION_RECOVERY_ATTEMPT_LIMIT` recovery creates, then throws `STRIPE_ERROR: "Stripe Checkout Session is expired or inactive"`. A failed create is not charged to this counter: `callStripeWithRetry` owns its own three-attempt transient retry policy, and an exhausted or non-transient create error exits the ladder immediately. The setup path is different: it does not retrieve after create; it loops on a missing URL or inactive create response and uses `trial_setup_session_recovery:{userId}:{subscriptionId}:{sessionId}:attempt:{attempt}:{requestFingerprint}`.

**The subscription flaw:** Stripe's documented create example returns an `open` Session, and a reused key returns the saved create response; this adapter then retrieves the Session and can observe that the old Session is now `complete` or `expired`. Each retained key whose live Session has become terminal consumes one of the three permitted recovery creates. Chain walk: primary resolves to terminal session A; rung 1 (`f(A)`) resolves to terminal B; rung 2 (`f(B)`) resolves to terminal C; rung 3 can create fresh session D, so four consecutive completions succeed. After D completes, the next invocation reaches `attempt === 4` and throws before creating another Session. A terminal post-retrieval snapshot is not *definitionally* a replay echo — a Session could change state between fresh creation and retrieval — but the observed E2E chain is the retained-key replay case.

> **Once four completed checkouts for one `(user, plan, variant)` remain reachable through retained Stripe idempotency keys, the fifth and later checkout attempts for that tuple fail hard until Stripe prunes a key.** Stripe documents only that pruning may occur after a key is at least 24 hours old. Failed attempts create no new Session, so they do not deepen the chain.

Observed server-log signature (2026-08-13): repeated `"Retrying checkout session creation with recovery idempotency key"` with `"status":"complete"` at `recoveryAttempt` 1→2→3, then `"Stripe checkout failed"` with `"errorMessage":"Stripe Checkout Session is expired or inactive"` → user lands on `/pricing?checkout=error`.

**Who hits it:**

- **Local E2E, deterministically while the keys remain retained.** `trial-start.spec.ts` is the only spec that completes a real hosted checkout, and it does so for a *stable* identity: `pnpm test:e2e` reuses the per-clone Docker test database; only manual `pnpm db:test:reset` runs `down -v`. The user UUID minted by `gen_random_uuid()` on the clone's first run therefore persists, while `resetE2EUserToFirstTimer()` cancels subscriptions without changing the customer or user identity. Result: after four successful same-tuple completions, the fifth and later full-gate E2E runs fail `trial-start` with `checkout=error` until Stripe prunes a chain key — a false red that reads like a billing regression.
- **CI: not exposed across jobs.** Each GitHub Actions job gets a fresh Postgres service and therefore a fresh app-user UUID, even though the owner-scoped Stripe test customer can be reused; because `userId` is in every checkout-chain key, keys do not repeat across CI jobs. The job runs the hosted completion once.
- **Production: narrow but nonzero path.** A completed Session implies a subscription, and `ALREADY_SUBSCRIBED` blocks further checkouts — a real user reaches four retained same-tuple completions only through repeated subscribe→lose-subscription→resubscribe loops while all chain keys remain retained. The failure mode there is a hard `checkout=error` for a paying-intent user.

## Impact

- Local full-gate cadence is silently capped at four successful same-tuple completions while all chain keys remain retained; later gates report the `trial-start` failure indistinguishably (at Playwright level) from a checkout regression.
- The warn logs reach `recoveryAttempt: 3`, `status: "complete"` without explaining that the next loop check throws before another create.
- Latent production edge (above) — same subscription root cause; the subscription fix must cover it.

## Resolution — owner re-review required after execution audit

**Audit correction — owner re-review required before implementation:** the subscription replay-chain defect is live, but two premises of the approved fix design did not survive verification. Stripe's saved-response semantics do not prove that the setup ladder can receive a terminal cache echo, and the subscription ladder performs a create plus a live retrieve per rung, not one Stripe call. The value 20 therefore has no verified four-second bound and must be checked against the pricing route's 30-second `maxDuration` before adoption.

**Constraints honored (all deliberate, all keep):** deterministic Stripe primary key and concurrency collapse (BUG-245; tests `stripe-checkout-sessions-concurrency.test.ts`); the caller key remains application-level idempotency while `StripePaymentGateway` deliberately ignores it for Checkout (BUG-245; pinned in `stripe-payment-gateway.test.ts`); `:trial:{days}` variant scoping (DEBT-410 §B.11 item 8); parameter-mismatch recovery via request-fingerprint keys (BUG-245 for subscription Checkout; DEBT-414 H10 for setup Checkout); open-session inspection/expiry reconciliation (DEBT-305). The depth has no source comment or recorded rationale. Git history shows BUG-245 introduced it as 20 and DEBT-414 later reduced it to 3; the setup exhaustion test hardcodes the current depth.

**Part A — reframe the subscription traversal bound (TDD); adjudicate setup separately.**

1. Red test first in `stripe-checkout-sessions-recovery.test.ts`: a chain of **6** completed retained-key replays followed by a fresh `open` Session must succeed. It fails at limit 3 today.
2. After owner re-review of the latency budget, rename `CHECKOUT_SESSION_RECOVERY_ATTEMPT_LIMIT` to describe subscription replay-chain traversal and document why the bound exists. Value **20** would restore BUG-245's original value, not introduce a new number. Do not claim a four-second bound: each subscription rung makes one create and one retrieve, each logical call can make up to three transient attempts, and observed worst-case latency is not yet measured.
3. Keep the subscription depth-exhaustion test limit-relative. If the setup loop continues sharing the bound, replace its literal four-call and attempt-1/2/3 assertions with limit-relative coverage. Retain low-depth warn logging and add the owner-approved depth ≥ 5 `error` signal without failing early.
4. Do not apply the replay-chain rationale identically to the trial-payment-method setup loop. Stripe says an idempotent reuse returns the saved original response; this loop does no live retrieve, so its mocked terminal create responses do not establish the live replay mechanism. Before changing its bound, add a provider-faithful test or other evidence and make a separate owner decision about its missing-URL/inactive-response safety cap.

**Part B — write the missing vendor knowledge down.** Add Stripe's saved-response semantics and at-least-24-hour key retention to `docs/vendor-docs/stripe.md` (currently contains no idempotency content), and a short note in `docs/dev/testing-infrastructure.md` that completed `trial-start` Sessions remain chain rungs while their keys are retained — with the local volume-persistence fact (`pnpm test:e2e` reuses the per-clone database; only `pnpm db:test:reset` drops its volume). Reconcile ADR-015 §4 with the later BUG-245 deterministic Checkout-key decision rather than citing the current ADR as permission.

**Rejected alternatives (each is the hack, with receipts):**

- **Entropy in the primary key** (per-run salt, timestamps, random component) — reopens BUG-245's double-billing hole and violates the current deterministic provider-key contract.
- **Rotate the Stripe customer in `resetE2EUserToFirstTimer()`** — does not change the key (`customer` is not a key component) and introduces avoidable provider-identity churn while leaving old-customer objects and events, contrary to the ownership discipline established by DEBT-386.
- **Test-only env salt read by production key-builders** — adds a test-only branch to production billing code without correcting production behavior.
- **Drop the DB volume per E2E run** — rotates the app-user UUID and therefore masks this key-chain defect, even though `seed-test-user.ts` re-finds the owner-matched Stripe customer. It is destructive, discards the stable-state test property, and substitutes test cleanup for a production-path fix.
- **Silently raise 3 → 10 without renaming** — leaves the bound's semantics and latency budget unexplained.
- **Depend on an `Idempotent-Replayed` response header** — Stripe does document the header ([advanced error handling](https://docs.stripe.com/error-low-level): "To identify a previously executed response that's being replayed from the server, look for the header `Idempotent-Replayed: true`"), and the installed SDK exposes `lastResponse.headers`, but the repo's deliberately narrow `StripeClient` type does not — and the subscription ladder's live retrieve already observes the terminal state, so the header adds nothing this fix needs. Optional future assertion only; not a fix dependency.

## Verification

- [ ] Subscription deep-chain red test (6 retained replays → fresh) is green after the owner-approved rename/raise; setup-loop treatment has separate provider-faithful evidence and owner approval
- [ ] Traversal cap has a WHY comment and measured latency fits the 30-second route budget; low-depth warns and depth ≥ 5 logs at `error`
- [ ] Existing pinned contracts untouched and green: concurrency collapse, application-only caller key, variant scoping, request-fingerprint mismatch recovery, exhaustion-at-limit
- [ ] Real-world proof: ≥ 5 consecutive local `pnpm test:e2e trial-start.spec.ts` completions pass while the prior keys remain retained
- [ ] `docs/vendor-docs/stripe.md` records saved-response and at-least-24-hour retention semantics; `docs/dev/testing-infrastructure.md` notes the volume-persistence + retained-chain interaction; ADR-015 §4 is reconciled with BUG-245

## Related

- Design lineage: [BUG-148](../_archive/bugs/bug-148-stripe-checkout-idempotency-key-fallback-random.md) (historical deterministic fallback + single-shot recovery, later superseded for caller keys by BUG-245), [DEBT-305](../_archive/debt/debt-305-checkout-session-reuse-expire-race.md) (`isSessionInactive` + terminal-expire classification), [DEBT-410](../_archive/debt/debt-410-free-trial-pathway-and-pricing-access-copy.md) §B.11 item 8 (variant-scoped keys), [BUG-245](../_archive/bugs/bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) (primary-key determinism + the original 20-rung bounded ladder + subscription request-fingerprint recovery), [DEBT-414 H10](./debt-414-public-legal-pages-privacy-terms.md) (setup request-fingerprint and inactive-response loop; shared bound reduced to 3)
- Constraint boundaries: [ADR-015 §4](../adr/adr-015-idempotency-strategy.md) (current text conflicts with the later deterministic Checkout key), [DEBT-386](../_archive/debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md) (E2E Stripe-resource ownership discipline)
- Adjacent, deliberately still unfiled (Audit #21 noted-only item, `docs/bugs/index.md`): Stripe `409 idempotency_key_in_use` is not classified transient, so an exactly-concurrent duplicate under the deterministic key fails one side with a generic `checkout=error` — became live when BUG-245 adopted deterministic keys; remains a separate P4 polish candidate, not absorbed here
