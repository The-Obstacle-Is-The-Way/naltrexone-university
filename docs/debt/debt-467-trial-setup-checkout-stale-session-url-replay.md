# DEBT-467: Trial Setup Checkout Replays a Stale Terminal Session URL

**Status:** Resolved
**Priority:** P3
**Date:** 2026-08-14
**Resolved:** 2026-08-15
**Source:** The 2026-08-14 DEBT-466 replay-semantics spike (receipts recorded in [DEBT-466](./debt-466-checkout-idempotency-replay-chain-exhaustion.md) and ADR-015 §4's dated amendment): a test-mode `mode: 'setup'` Checkout Session was created, replayed, expired via API, and replayed again — same-key create kept returning the saved `open` body and URL (with `Idempotent-Replayed`) while live retrieve returned `expired`. Filed from that spike's proposed register entry after owner review, with a same-day code-path sweep of the trial add-card flow.
**Scope:** `createStripeTrialPaymentMethodSetupSession` (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:121`) and its call chain — the DEBT-414 Stage 2 trial add-card flow. The subscription checkout ladder is **not** in scope: it wraps every create in a live-retrieval attempt and is governed by DEBT-466's settled design. DEBT-466 Part A split the setup side onto the interim `TRIAL_SETUP_SESSION_RESPONSE_RECOVERY_ATTEMPT_LIMIT = 3`; this item replaces it with the post-retrieval `TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT = 10`.

---

## Description

At filing, the trial add-card flow created `mode: 'setup'` Checkout Sessions under a deterministic primary idempotency key — `trial_setup_session:{userId}:{externalSubscriptionId}:{disclosureVersion}` (now line 161) — with **no post-create live retrieval**. Its replacement loop evaluated only the create *response* (`!session.url || isSessionInactive(session, Date.now)`), and Stripe's documented idempotency behavior returns the **saved first response** for a reused key ([idempotent requests](https://docs.stripe.com/api/idempotent_requests)). The resolved path retrieves live state after the primary create and every recovery create (lines 197–229).

What the saved body can and cannot detect:

- **Live Session still `open`** → replay returns the same open Session and URL — correct deduplication; keep this behavior.
- **Live Session naturally expired** → the setup params set no `expires_at` (lines 145–159), so Stripe's documented default of 24 hours applies ([create parameter `expires_at`](https://docs.stripe.com/api/checkout/sessions/create)); the saved body's own `expires_at` has passed by then, `isSessionInactive` (lines 250–266) self-detects it, and the loop replaces the Session — already handled before a retrieve was added.
- **Live Session `complete`, or expired out-of-band before its `expires_at`** → the saved body still says `open` with a future `expires_at`. Before resolution, the loop accepted it and the adapter returned the terminal Session's id and URL. This was the defect. The spike directly observed the expired-early branch; the completed branch follows from Stripe's saved-response contract and the Session status transition.

Reachability is not narrow:

- The layout-level trial banner renders the "Add a card to keep access" button on every app page load when `subscriptionStatus === 'inTrial'`, `plan`, and `trialEndsAt` are present (`app/(app)/app/layout.tsx:218–227`) — there is no payment-method-attached or operation-state check. Completing add-card does not end the trial (the card is charged at trial end by design), so those inputs remain true and the button stays visible for the rest of the trial after a completed setup.
- The use case performs no setup-Session or operation-state preflight. Once its user/subscription identifiers and consent prerequisites pass, the session-eligibility guard is only an unexpired `inTrial` subscription (lines 53–61), and every eligible invocation calls the gateway create (`src/application/use-cases/create-trial-payment-method-setup-session.ts:99–100`).
- On replay, the duplicate pending-operation insert is absorbed **silently**: `createPending` is `onConflictDoNothing` plus a snapshot match (`src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository.ts:92–118`), so nothing downstream flags the reuse.
- Parameter drift was already safe and was not this defect: a changed disclosure version rotates the primary key itself, and same-key parameter changes trigger Stripe's idempotency parameter-mismatch error, recovered via `trial_setup_session_recovery:{userId}:{externalSubscriptionId}:request:{requestFingerprint}` (lines 175–195). The stale replay was specifically the **same-parameters** re-invocation.
- Nothing in the application expires setup Sessions early — the module's only `checkout.sessions.expire` sites (`expireSupersededCheckoutSession` and the preflight-inspection path) belong to the subscription flow — so the `complete` case is the production-reachable trigger; out-of-band expiry (Dashboard or API tooling, as in the spike) also opens it.

**Concrete pre-resolution failure:** a trial user completed add-card, then clicked the still-visible banner button again while the key remained retained and the saved `expires_at` was still in the future. That timestamp is 24 hours after Session **creation**, not completion. Stripe replayed the completed Session's saved `open` body; the loop accepted it; the user was redirected to a Checkout URL whose live Session was `complete`. Per Stripe's Session status semantics an expired Session processes nothing further and a complete Session's checkout has already finished ([status enum](https://docs.stripe.com/api/checkout/sessions/object)) — either way the URL cannot yield a new payment-method setup. Stripe documents that loading an expired Session's URL shows an expiration message ([expire a Session](https://docs.stripe.com/api/checkout/sessions/expire)); the hosted page's completed-Session presentation remains unobserved locally. The stale-acceptance window ended once the saved `expires_at` passed or Stripe pruned the primary key — at most the remainder of the Session's original 24-hour lifetime — after which the old code either received a fresh primary response or entered its recovery loop.

## Impact before resolution

- A trial user could be handed a non-usable Checkout URL for up to the remainder of the Session's original 24-hour lifetime after completing (or an operator expiring) a setup Session — a broken repeat attempt on the consent-critical DEBT-414 Stage 2 billing surface.
- The failure was invisible server-side: no error was thrown, no log distinguished replay acceptance from a fresh create, and the duplicate pending-operation write was silently absorbed.
- Without live retrieval, the setup loop advanced only when a saved body's own `expires_at` had passed; a completed live Session was accepted and consumed no recovery attempt. Stripe permits pruning after a key is at least 24 hours old but documents no maximum retention, so the retention/expiry overlap could not be called small from the vendor contract. Strict live retrieval makes retained completed Sessions consume recovery rungs; Resolution step 3 therefore re-decided the bound as a real traversal cap rather than assuming exhaustion was self-limited.

## Resolution (implemented 2026-08-15)

The subscription ladder's live-state guard now protects the setup path, with a stricter retrieval-failure outcome:

1. **Provider-faithful fake and red proof.** `FakeStripeCheckoutClient` now lives under the adapter-owned `src/adapters/gateways/stripe/test-helpers/` boundary. Its contract suite proves that the first create response stays frozen by idempotency key while retrieve reads mutable live state and `markComplete` / `markExpired` drive both supported modes. The audit confirmed why a new fake was necessary: the closest old double, `createConcurrentStripeMock` (`stripe-checkout-sessions-concurrency.test.ts:17–128`), rejects `mode: 'setup'` and cannot transition a Session to `complete`. Before implementation, the behavior slice reported two expected failures — completed and expired-early replay both returned `cs_fake_1` — while open replay and natural-expiry replacement remained green. Adding the strict-failure assertions raised the red slice to five failures before production code changed.
2. **Strict live post-create retrieval.** `createStripeTrialPaymentMethodSetupSession` now calls `retrieveLiveCheckoutSessionAfterCreate` for the primary and every recovery create (lines 197–229). The helper's explicit `require-verified-status` policy (lines 566–629) throws when retrieval exhausts its retry policy, returns a different id, or omits live `status`, before the nullable merge can backfill from an unverified saved response. Subscription Checkout explicitly uses `fallback-to-created`, preserving its warn-and-fallback contracts pinned unchanged in `stripe-checkout-sessions-live-retrieve.test.ts:57–119`. Attempt-scoped setup recovery keys remain `trial_setup_session_recovery:{userId}:{externalSubscriptionId}:{sessionId}:attempt:{attempt}:{requestFingerprint}` (line 214).
3. **Measured setup traversal cap.** The interim defective-response limit of 3 is replaced by `TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT = 10`. The existing 2026-08-14 setup-mode probe measured 120.5 ms create and 99.2 ms retrieve medians (five samples each); under the repository retry envelope, a third-attempt success for both calls budgets `3×120.5 + 300 + 3×99.2 + 300 = 1,259.1 ms` per rung. Primary plus 10 recoveries budgets 13.850 seconds, below half the 30-second `maxDuration` exported by `app/(app)/app/layout.tsx:24`; the source WHY comment records that this is a healthy-service planning cap, not a request timeout. Exact limit-relative tests prove fresh success on recovery create `L` and exhaustion after primary plus `L` terminal recoveries without issuing create `L + 1`.
4. **Invariants preserved.** The new setup slice verifies identical, valid `consent_state_signature` metadata on primary and recovery creates. The focused invariant run passed 19 files / 179 tests spanning every Checkout gateway suite, setup use case and repository, completion/expiration webhook paths, billing controller, and the Server Action; request-fingerprint mismatch recovery, operation snapshot matching, and caller-UUID idempotency remain green.
5. **ADR-015 §4 amended.** Its dated exception now extends to setup only under strict matching-id retrieval with a present status, bounded traversal, deterministic key scoping, and request-fingerprint recovery. The subscription-only logged fallback is explicitly distinguished from setup's fail-closed policy.
6. **Optional implementation-time probe not run.** The completed hosted-page presentation remains unchecked below; it is not needed to decide whether the adapter may return a Session, because the fix fails or recovers from Stripe's live API state before redirect.

**Rejected alternatives:**

- **Entropy or timestamps in the primary key** — reopens concurrent same-setup duplication and discards the deterministic setup key introduced by the DEBT-414 Stage 2 implementation (`3c5cfb81`). H10 (`a4464f2f`) later preserved that key while adding request-fingerprint and inactive-response recovery; BUG-245 is the earlier subscription-path precedent, not the setup key's introducing change.
- **UI-only fix (hide the button after completion)** — narrows one trigger without fixing the mechanism; stale replay stays reachable via multi-tab use, webhook delay, and out-of-band expiry.
- **App-side expire-then-recreate preflight** — adds a Stripe write per invocation and still races the replay window; the subscription path's answer (retrieve after create) is strictly simpler and already proven in this module.
- **Depend on the `Idempotent-Replayed` header** — same verdict as DEBT-466: documented, but not exposed by the deliberately narrow `StripeClient` type, and unnecessary once live retrieval decides from real state.

## Verification

- [x] Replay-faithful red test proves stale acceptance before the fix (`complete` and expired-early cases) and turns green with live retrieval; open-replay dedup and natural-expiry replacement pinned unchanged
- [x] Primary and recovery setup creates all retrieve live state; exhausted retrieval, id mismatch, and missing live status fail closed before merge/redirect, while the subscription path's existing fallback remains unchanged
- [x] Setup bound re-decided with measured receipts (route budget + rung arithmetic); its WHY comment states the post-retrieval semantics
- [x] Consent metadata, state signature, operation snapshot matches, and mismatch recovery pinned by tests before and after
- [ ] Test-mode observation of the completed setup URL recorded in this doc; Stripe's documented expired-page behavior recorded and optionally corroborated
- [x] ADR-015 §4 amended (dated) to extend the exception to the setup path in the implementing PR

## Related

- [DEBT-466](./debt-466-checkout-idempotency-replay-chain-exhaustion.md) — the spike that proved the replay mechanism (probe receipts recorded there and in ADR-015 §4); its Part A constant split supplied this item's interim setup-specific bound
- [ADR-015 §4](../adr/adr-015-idempotency-strategy.md) — dated amendment extended 2026-08-15 to license setup only under the implemented strict-retrieval conditions
- [DEBT-414 H10](./debt-414-public-legal-pages-privacy-terms.md) — introduced the setup fingerprint recovery and inactive-response loop; its commit `a4464f2f` reduced the then-shared bound to 3
- [BUG-245](../_archive/bugs/bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) — the deterministic-key + live-retrieve pattern this fix mirrors
- [DEBT-305](../_archive/debt/debt-305-checkout-session-reuse-expire-race.md) — `isSessionInactive` and terminal-expire classification
