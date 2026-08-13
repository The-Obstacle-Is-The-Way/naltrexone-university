# DEBT-466: Checkout Idempotency Replay-Chain Exhaustion (Recovery Ladder Miscounts Cache Echoes)

**Status:** Open
**Priority:** P3
**Date:** 2026-08-13
**Source:** Live diagnosis of repeated `trial-start.spec.ts` E2E failures on 2026-08-13 (server-log signature captured; mechanism verified against Stripe with standalone repros), plus a design-history sweep of the checkout idempotency arc (BUG-148 → DEBT-305 → DEBT-410 D8 → BUG-245 → DEBT-414 H10).
**Scope:** `createStripeCheckoutSession` and `createStripeTrialPaymentMethodSetupSession` in `src/adapters/gateways/stripe/stripe-checkout-sessions.ts` share `CHECKOUT_SESSION_RECOVERY_ATTEMPT_LIMIT = 3` (line 25 — no comment, no doc, no hardcoded test pin). This item fixes the *bound's semantics*; every other element of the design is deliberate and stays.

---

## Description

The checkout gateway creates Stripe Checkout Sessions under a **deterministic** primary idempotency key — `checkout_session:{userId}:{plan}[:trial:{days}]` — a load-bearing decision (BUG-245: collapses concurrent same-plan creates so two tabs cannot double-bill; ADR-015 §4 permits this deterministic redirect-artifact key *only because* a staleness guard and recovery path exist). Stripe retains idempotency keys for **~24 hours** and replays the original response for a reused key — a retention window documented nowhere in this repo until this item (every existing "24 hour" reference is a different TTL: the app's own `idempotency_keys` table, Checkout Session lifetime, Resend).

The staleness guard walks a recovery ladder: if the created session comes back **inactive** (`isSessionInactive`: `status !== 'open'` or `expires_at` past), retry under `checkout_session_recovery:{userId}:{plan}:{staleSessionId}[:trial:{days}]`, up to `CHECKOUT_SESSION_RECOVERY_ATTEMPT_LIMIT` rungs, then throw `STRIPE_ERROR: "Stripe Checkout Session is expired or inactive"`.

**The flaw:** a *freshly created* session is always `open` with `expires_at ≈ now + 24h`, so an inactive session returned by a create call is **definitionally a cache echo** of an earlier creation — never a failed fresh creation. The ladder charges these echoes against a 3-rung budget as if they were failures. Each *completed* checkout for the same `(user, plan, variant)` permanently occupies one rung for the next ~24h (its key replays that completed session). Chain walk: primary echoes session A; rung 1 (`f(A)`) echoes B; rung 2 (`f(B)`) echoes C; the first fresh creation happens at rung N for N prior completions. Since the guard throws when `attempt > 3`:

> **Once more than 3 completed checkouts for one `(user, plan, variant)` sit inside Stripe's rolling 24-hour idempotency window, every further checkout attempt for that tuple fails hard until one ages out.** Failed attempts create nothing, so the condition persists for hours.

Observed server-log signature (2026-08-13): repeated `"Retrying checkout session creation with recovery idempotency key"` with `"status":"complete"` at `recoveryAttempt` 1→2→3, then `"Stripe checkout failed"` with `"errorMessage":"Stripe Checkout Session is expired or inactive"` → user lands on `/pricing?checkout=error`.

**Who hits it:**

- **Local E2E, deterministically.** `trial-start.spec.ts` is the only spec that completes a real hosted checkout, and it does so for a *stable* identity: the per-clone Docker test-DB volume is never dropped by `pnpm test:e2e` (only manual `pnpm db:test:reset` runs `down -v`), so the app user UUID minted by `gen_random_uuid()` on the clone's first-ever run persists across "fresh" runs, and `resetE2EUserToFirstTimer()` cancels subscriptions without ever touching the customer or user identity. Result: the 4th-and-later full-gate E2E runs inside a 24h window fail `trial-start` with `checkout=error` — a false red that reads like a billing regression.
- **CI: immune.** CI's ephemeral database mints a fresh user UUID per run, so keys never repeat across runs.
- **Production: near-zero but nonzero.** A completed session implies a subscription, and `ALREADY_SUBSCRIBED` blocks further checkouts — a real user reaches the 4-completions-in-24h state only via repeated same-day subscribe→lose-subscription→resubscribe loops (refund/support churn). Rare, but the failure mode there is a hard `checkout=error` for a paying-intent user.

## Impact

- Local full-gate cadence is silently capped: from the 4th completed trial-start in 24h, every gate reports E2E 37/38 with a failure indistinguishable (at Playwright level) from a checkout regression. Cost on 2026-08-13: multiple gate re-runs and a multi-hour diagnosis during the DEBT-465 doc-audit push cycle.
- The unbounded-looking retry logs (`recoveryAttempt: 3`, `status: "complete"`) invite misdiagnosis; nothing in the repo explained the mechanism before this filing.
- Latent production edge (above) — same root cause, same fix.

## Resolution — fix the bound's semantics, change nothing else

**Constraints honored (all deliberate, all keep):** deterministic primary key and concurrency collapse (BUG-245; tests `stripe-checkout-sessions-concurrency.test.ts`); caller-supplied keys are never laddered (BUG-148); `:trial:{days}` variant scoping (DEBT-410 D8); parameter-mismatch recovery via request-fingerprint keys (DEBT-414 H10, `createSessionWithIdempotencyParameterRecovery`); open-session inspection/expiry reconciliation (DEBT-305). The ladder's *depth* is the sole undocumented, unpinned element — the exhaustion tests derive from the constant rather than hardcoding 3.

**Part A — reframe the traversal bound (TDD, both ladders).**

1. Red test first, in `stripe-checkout-sessions-recovery.test.ts` (and the setup-session twin in `stripe-checkout-sessions-trials.test.ts`): a chain of **6** completed replays followed by a fresh `open` session must succeed. Fails at limit 3 today.
2. Rename `CHECKOUT_SESSION_RECOVERY_ATTEMPT_LIMIT` → `CHECKOUT_SESSION_REPLAY_CHAIN_TRAVERSAL_LIMIT` (or equivalent) with a WHY comment stating the semantics: an inactive create-result is a 24h idempotency-cache echo (fresh sessions are always `open`), each rung is one prior completed checkout, the chain is linear (each recovery key embeds the *prior session id*, so cycles would require a key collision), and one rung costs one Stripe call — so the bound is a runaway-safety cap, not a retry budget. Value: **20** (headroom ≫ any plausible same-day completion count; still bounds a pathological walk to ~4s of API calls).
3. Keep the depth-exhaustion tests (they compute from the constant) and add a depth-visibility line: the existing `recoveryAttempt` warn log is sufficient at low depths; log at `error` level from depth ≥ 5 so a genuinely long chain is loud without failing.
4. Apply identically to the trial-payment-method-setup ladder (same constant, `stripe-checkout-sessions.ts` line ~184).

**Part B — write the missing vendor knowledge down.** Add Stripe's ~24h idempotency-key retention (and its interaction with deterministic keys + the replay-echo invariant) to `docs/vendor-docs/stripe.md` (currently contains no idempotency content), and a short note in `docs/dev/testing-infrastructure.md` that `trial-start` completions are chain rungs per 24h window — with the local volume-persistence fact (`pnpm test:e2e` reuses the per-clone volume; only `pnpm db:test:reset` drops it).

**Rejected alternatives (each is the hack, with receipts):**

- **Entropy in the primary key** (per-run salt, timestamps, random component) — reopens BUG-245's double-billing hole; violates the ADR-015 §4 license under which this deterministic key exists.
- **Rotate the Stripe customer in `resetE2EUserToFirstTimer()`** — recreates the customer↔UUID ownership-drift class that DEBT-386 spent a full arc eliminating (stale `metadata.user_id`, webhook 500s), and doesn't change the key anyway (`customer` is not a key component).
- **Test-only env salt read by production key-builders** — a test-shaped branch in production billing code; forbidden by taste and by the fakes-over-mocks/no-test-seams discipline.
- **Drop the DB volume per E2E run** — slow, doesn't rotate the Stripe-side identity (`seed-test-user.ts` re-finds the owner-matched customer by email + `e2e_owner` metadata), and manufactures exactly the stale-`metadata.user_id` drift DEBT-386 documents.
- **Silently raise 3 → 10 without renaming** — same numbers, wrong story; the constant would still read as a retry budget and invites being "tightened back".
- **Detect echoes via Stripe's `Idempotent-Replayed` response header** — precise but requires widening the deliberately narrow `StripeClient` structural type for `lastResponse` access, and is redundant: inactive-on-create already implies replay by construction. Optional future assertion only.

## Verification

- [ ] Deep-chain red test (6 echoes → fresh) added for both ladders; green after the rename/raise
- [ ] Constant renamed with WHY comment; both loops share it; depth ≥ 5 logs at `error`
- [ ] Existing pinned contracts untouched and green: concurrency collapse, caller-key non-laddering, variant scoping, request-fingerprint mismatch recovery, exhaustion-at-limit
- [ ] Real-world proof: ≥ 4 consecutive same-day local `pnpm test:e2e trial-start.spec.ts` completions pass
- [ ] `docs/vendor-docs/stripe.md` gains the idempotency-retention section; `docs/dev/testing-infrastructure.md` notes the volume-persistence + chain-rung interaction

## Related

- Design lineage: [BUG-148](../_archive/bugs/bug-148-stripe-checkout-idempotency-key-fallback-random.md) (deterministic fallback + single-shot recovery), [DEBT-305](../_archive/debt/debt-305-checkout-session-reuse-expire-race.md) (`isSessionInactive` + terminal-expire classification), [DEBT-410](../_archive/debt/debt-410-free-trial-pathway-and-pricing-access-copy.md) D8 (variant-scoped keys), [BUG-245](../_archive/bugs/bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) (primary-key determinism + the bounded ladder + mismatch recovery), DEBT-414 H10 (request-fingerprint rung; `docs/debt/debt-414-public-legal-pages-privacy-terms.md`)
- Constraint boundaries: [ADR-015 §4](../adr/adr-015-idempotency-strategy.md) (redirect-artifact key license), [DEBT-386](../_archive/debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md) (why identity rotation is off the table)
- Adjacent, deliberately still unfiled (Audit #21 noted-only item, `docs/bugs/index.md`): Stripe `409 idempotency_key_in_use` is not classified transient, so an exactly-concurrent duplicate under the deterministic key fails one side with a generic `checkout=error` — became live when BUG-245 adopted deterministic keys; remains a separate P4 polish candidate, not absorbed here
