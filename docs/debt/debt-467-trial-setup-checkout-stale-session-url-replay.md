# DEBT-467: Trial Setup Checkout Replays a Stale Terminal Session URL

**Status:** Open
**Priority:** P3
**Date:** 2026-08-14
**Source:** The 2026-08-14 DEBT-466 replay-semantics spike (receipts recorded in [DEBT-466](./debt-466-checkout-idempotency-replay-chain-exhaustion.md) and ADR-015 §4's dated amendment): a test-mode `mode: 'setup'` Checkout Session was created, replayed, expired via API, and replayed again — same-key create kept returning the saved `open` body and URL (with `Idempotent-Replayed`) while live retrieve returned `expired`. Filed from that spike's proposed register entry after owner review, with a same-day code-path sweep of the trial add-card flow.
**Scope:** `createStripeTrialPaymentMethodSetupSession` (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:114`) and its call chain — the DEBT-414 Stage 2 trial add-card flow. The subscription checkout ladder is **not** in scope: it wraps every create in a live-retrieval attempt and is governed by DEBT-466's settled design. DEBT-466 Part A split the setup side onto `TRIAL_SETUP_SESSION_RESPONSE_RECOVERY_ATTEMPT_LIMIT = 3`; this item now owns what that bound means after strict live retrieval.

---

## Description

The trial add-card flow creates `mode: 'setup'` Checkout Sessions under a deterministic primary idempotency key — `trial_setup_session:{userId}:{externalSubscriptionId}:{disclosureVersion}` (line 154). Unlike the subscription path, the setup path performs **no post-create live retrieval**: its replacement loop (lines 190–215) evaluates only the create *response* (`!session.url || isSessionInactive(session, Date.now)`), and Stripe's documented idempotency behavior returns the **saved first response** for a reused key ([idempotent requests](https://docs.stripe.com/api/idempotent_requests)).

What the saved body can and cannot detect:

- **Live Session still `open`** → replay returns the same open Session and URL — correct deduplication; keep this behavior.
- **Live Session naturally expired** → the setup params set no `expires_at` (lines 138–152), so Stripe's documented default of 24 hours applies ([create parameter `expires_at`](https://docs.stripe.com/api/checkout/sessions/create)); the saved body's own `expires_at` has passed by then, `isSessionInactive` (lines 233–249) self-detects it, and the loop replaces the Session — already handled without a retrieve.
- **Live Session `complete`, or expired out-of-band before its `expires_at`** → the saved body still says `open` with a future `expires_at`. The loop accepts it and the adapter returns the terminal Session's id and URL. This is the defect. The spike directly observed the expired-early branch; the completed branch follows from Stripe's saved-response contract and the Session status transition.

Reachability is not narrow:

- The layout-level trial banner renders the "Add a card to keep access" button on every app page load when `subscriptionStatus === 'inTrial'`, `plan`, and `trialEndsAt` are present (`app/(app)/app/layout.tsx:218–227`) — there is no payment-method-attached or operation-state check. Completing add-card does not end the trial (the card is charged at trial end by design), so those inputs remain true and the button stays visible for the rest of the trial after a completed setup.
- The use case performs no setup-Session or operation-state preflight. Once its user/subscription identifiers and consent prerequisites pass, the session-eligibility guard is only an unexpired `inTrial` subscription (lines 53–61), and every eligible invocation calls the gateway create (`src/application/use-cases/create-trial-payment-method-setup-session.ts:99–100`).
- On replay, the duplicate pending-operation insert is absorbed **silently**: `createPending` is `onConflictDoNothing` plus a snapshot match (`src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository.ts:92–118`), so nothing downstream flags the reuse.
- Parameter drift is already safe and is not this defect: a changed disclosure version rotates the primary key itself, and same-key parameter changes trigger Stripe's idempotency parameter-mismatch error, recovered via `trial_setup_session_recovery:{userId}:{externalSubscriptionId}:request:{requestFingerprint}` (lines 168–187). The stale replay is specifically the **same-parameters** re-invocation.
- Nothing in the application expires setup Sessions early — the module's only `checkout.sessions.expire` sites (`expireSupersededCheckoutSession` and the preflight-inspection path) belong to the subscription flow — so the `complete` case is the production-reachable trigger; out-of-band expiry (Dashboard or API tooling, as in the spike) also opens it.

**Concrete failure:** a trial user completes add-card, then clicks the still-visible banner button again while the key remains retained and the saved `expires_at` is still in the future. That timestamp is 24 hours after Session **creation**, not completion. Stripe replays the completed Session's saved `open` body; the loop accepts; the user is redirected to a Checkout URL whose live Session is `complete`. Per Stripe's Session status semantics an expired Session processes nothing further and a complete Session's checkout has already finished ([status enum](https://docs.stripe.com/api/checkout/sessions/object)) — either way the URL cannot yield a new payment-method setup. Stripe documents that loading an expired Session's URL shows an expiration message ([expire a Session](https://docs.stripe.com/api/checkout/sessions/expire)); the hosted page's completed-Session presentation remains for implementation-time observation. This stale-acceptance window ends once the saved `expires_at` passes or Stripe prunes the primary key — at most the remainder of the Session's original 24-hour lifetime — after which the current code either receives a fresh primary response or enters its recovery loop.

## Impact

- A trial user can be handed a non-usable Checkout URL for up to the remainder of the Session's original 24-hour lifetime after completing (or an operator expiring) a setup Session — a broken repeat attempt on the consent-critical DEBT-414 Stage 2 billing surface.
- The failure is invisible server-side: no error is thrown, no log distinguishes replay acceptance from a fresh create, and the pending-operation write no-ops silently.
- Today, without live retrieval, the setup loop advances only when a saved body's own `expires_at` has passed; a completed live Session is accepted and consumes no recovery attempt. Stripe permits pruning after a key is at least 24 hours old but documents no maximum retention, so the retention/expiry overlap cannot be called small from the vendor contract. Once this fix adds strict live retrieval, retained completed Sessions can consume recovery rungs; step 3 therefore re-decides the bound as a real traversal cap rather than assuming exhaustion is self-limited.

## Resolution (design audited against post-DEBT-466 Part A code; implementation pending)

Apply the subscription ladder's live-state guard on the setup path, with a stricter retrieval-failure outcome:

1. **Red test first, provider-faithful.** The DEBT-466 audits established that mocked *terminal create bodies* do not model replay reality. Build the fake so a repeated idempotency key returns the **saved first response** while `checkout.sessions.retrieve` reports live state. Red assertions: today the adapter returns the stale id/URL when live state is `complete` (and when expired before `expires_at`); after the fix it must return a fresh usable Session. Pin green-before-and-after: open-Session replay still dedups to the same Session; naturally-expired replay already recovers via the saved `expires_at`. The closest current double, `createConcurrentStripeMock` (`stripe-checkout-sessions-concurrency.test.ts:17–128`), rejects `mode: 'setup'` and exposes no transition to `complete`.
2. **Add strict live post-create retrieval** to `createStripeTrialPaymentMethodSetupSession` for the primary and every recovery create. Reuse the module-private `retrieveLiveCheckoutSessionAfterCreate` retry/merge mechanics (`stripe-checkout-sessions.ts:531–591`) through an explicit strict policy or setup-specific wrapper, but not its current subscription fallback. The fallback-on-retrieval-failure and fallback-on-id-mismatch contracts are pinned in `stripe-checkout-sessions-live-retrieve.test.ts:57–119`. Validate the raw retrieved snapshot before merge: if retrieval fails after its retry policy, the retrieved id differs, or the live `status` is absent, setup must throw rather than backfill those facts from the unverified created/replayed snapshot and authorize a redirect. Keep the subscription helper's existing warn-and-fallback behavior unchanged under this item. The existing loop then sees an explicit verified live status, and the current attempt-scoped recovery keys (`trial_setup_session_recovery:{userId}:{externalSubscriptionId}:{sessionId}:attempt:{attempt}:{requestFingerprint}`, line 202) can traverse retained terminal responses.
3. **Re-decide the setup bound with receipts.** DEBT-466 Part A names the split setup constant a *defective-response replacement* bound (3; `stripe-checkout-sessions.ts:32–35`). Strict live retrieval changes its meaning to genuine replay traversal. Re-run DEBT-466's rung arithmetic against the 30-second budget already declared by `app/(app)/app/layout.tsx:24` and every currently compiled `/app/*` function, measure setup-path latency, and either keep 3 or raise it with a measured WHY comment. Do not silently inherit either value.
4. **Preserve the invariants:** consent metadata and `consent_state_signature` on every create (recovery creates already reuse the same `params`); `createPending` snapshot matching; webhook completion/expiration snapshot matching (`src/adapters/controllers/stripe-webhook-controller.ts`); the parameter-mismatch recovery wrapper; app-level caller-UUID idempotency on the Server Action.
5. **ADR-015 §4 follow-up amendment.** The dated 2026-08-14 amendment deliberately withholds the deterministic-key license from the no-retrieve setup path. Once this fix lands and the license conditions hold (live retrieval, bounded recovery, key scoping, fingerprint-mismatch recovery), amend §4 — dated, in the implementing PR — to extend the exception to setup.
6. **Implementation-time probe:** observe in test mode what Stripe's hosted page actually shows for a completed setup-Session URL and record it here. Stripe already documents the expired-Session page's expiration message; optionally corroborate that presentation in the same probe.

**Rejected alternatives:**

- **Entropy or timestamps in the primary key** — reopens concurrent same-setup duplication and discards the deterministic setup key introduced by the DEBT-414 Stage 2 implementation (`3c5cfb81`). H10 (`a4464f2f`) later preserved that key while adding request-fingerprint and inactive-response recovery; BUG-245 is the earlier subscription-path precedent, not the setup key's introducing change.
- **UI-only fix (hide the button after completion)** — narrows one trigger without fixing the mechanism; stale replay stays reachable via multi-tab use, webhook delay, and out-of-band expiry.
- **App-side expire-then-recreate preflight** — adds a Stripe write per invocation and still races the replay window; the subscription path's answer (retrieve after create) is strictly simpler and already proven in this module.
- **Depend on the `Idempotent-Replayed` header** — same verdict as DEBT-466: documented, but not exposed by the deliberately narrow `StripeClient` type, and unnecessary once live retrieval decides from real state.

## Verification

- [ ] Replay-faithful red test proves stale acceptance today (`complete` and expired-early cases) and turns green with live retrieval; open-replay dedup and natural-expiry replacement pinned unchanged
- [ ] Primary and recovery setup creates all retrieve live state; exhausted retrieval, id mismatch, and missing live status fail closed before merge/redirect, while the subscription path's existing fallback remains unchanged
- [ ] Setup bound re-decided with measured receipts (route budget + rung arithmetic); its WHY comment states the post-retrieval semantics
- [ ] Consent metadata, state signature, operation snapshot matches, and mismatch recovery pinned by tests before and after
- [ ] Test-mode observation of the completed setup URL recorded in this doc; Stripe's documented expired-page behavior recorded and optionally corroborated
- [ ] ADR-015 §4 amended (dated) to extend the exception to the setup path in the implementing PR

## Related

- [DEBT-466](./debt-466-checkout-idempotency-replay-chain-exhaustion.md) — the spike that proved the replay mechanism (probe receipts recorded there and in ADR-015 §4); its Part A constant split is implemented and supplies this item's setup-specific starting bound
- [ADR-015 §4](../adr/adr-015-idempotency-strategy.md) — dated amendment currently withholding the deterministic-key license from setup; Resolution step 5 extends it once the conditions hold
- [DEBT-414 H10](./debt-414-public-legal-pages-privacy-terms.md) — introduced the setup fingerprint recovery and inactive-response loop; its commit `a4464f2f` reduced the then-shared bound to 3
- [BUG-245](../_archive/bugs/bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) — the deterministic-key + live-retrieve pattern this fix mirrors
- [DEBT-305](../_archive/debt/debt-305-checkout-session-reuse-expire-race.md) — `isSessionInactive` and terminal-expire classification
