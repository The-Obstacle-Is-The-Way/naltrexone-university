# BUG-289: Default Idempotency Policy Caches Transient Errors on Billing/Bookmark/Feedback Actions Whose Client Keys Do Not Rotate on Failure

**Status:** Active
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing)
**Component:** Idempotency / billing / bookmarks / feedback

---

## Summary

`withIdempotency`'s default error policy durably caches **every** `execute()` error for the 24h TTL: [`shouldCacheExecutionError`](../../src/adapters/shared/with-idempotency.ts#L67) returns `true` whenever no `shouldCacheError` policy is passed, and the wait-loop [replays `existing.error`](../../src/adapters/shared/with-idempotency.ts#L308-L317) as a fresh `ApplicationError` without re-executing. BUG-278 fixed this on the end/discard abandonment actions and DEBT-435 on practice state writes, but five idempotent actions still pass no `shouldCacheError`: [`billing:createCheckoutSession`](../../src/adapters/controllers/billing-controller.ts#L141-L149), [`billing:createPortalSession`](../../src/adapters/controllers/billing-controller.ts#L188-L196), [`bookmark:setBookmark`](../../src/adapters/controllers/bookmark-controller.ts#L103-L111), [`question-feedback:rateQuestion`](../../src/adapters/controllers/question-feedback-controller.ts#L154-L162), and [`question-feedback:submitQuestionReport`](../../src/adapters/controllers/question-feedback-controller.ts#L210-L219) (the last passes `outcomeStoreFailurePolicy` but that is a different knob — it governs outcome-store failures, not which execute errors get cached).

On all five surfaces the client reuses the same idempotency key on retry. [`IdempotencyKeyField`](../../components/idempotency-key-field.tsx#L6) is a fixed `useState(() => crypto.randomUUID())` per mount, used by the trial-countdown banner in the persistent app layout ([`layout.tsx#L139-L140`](<../../app/(app)/app/layout.tsx#L139-L140>)), the `/app/billing` and `/app/bookmarks` forms, and the pricing checkout CTA (`app/pricing/pricing-auth-cta.tsx`); the bookmark and rating/report client seams rotate their key **only on success** ([`bookmark-toggle.ts#L89-L91`](<../../app/(app)/app/shared/bookmark-toggle.ts#L89-L91>), [`question-feedback-actions.ts#L91-L93`](<../../app/(app)/app/shared/question-feedback-actions.ts#L91-L93>)). One transient failure (Neon blip, Stripe 503 → gateway `STRIPE_ERROR`) therefore poisons the key, and every subsequent retry deterministically replays the cached error until remount/hard reload or TTL expiry.

## Reachability

Any signed-in user of the five surfaces, whenever a transient infrastructure fault lands exactly during `execute()`:

- **Trial-countdown banner** ("Add a card to keep access") — rendered by the persistent `app/(app)/app/layout.tsx`, so its `IdempotencyKeyField` state survives all client-side navigations.
- **`/app/billing` "Manage billing"** and the **pricing checkout CTA** — money-path portal/checkout session creation.
- **Bookmark toggle/remove** and **question rating/report** — the client keeps the failed key because rotation is success-only.

Precondition: a one-off failure (DB blip, Stripe 5xx) inside the wrapped `execute()` on that surface. No adversarial action required; the failure is infrastructure-induced, not self-inflicted.

## Reproduction

Portal-session interleaving (the trial-banner scenario; the other four surfaces follow the same mechanics):

1. A trial user clicks "Add a card to keep access" on the trial banner ([`layout.tsx#L139-L140`](<../../app/(app)/app/layout.tsx#L139-L140>)); the form submits the mount-fixed key from [`idempotency-key-field.tsx#L6`](../../components/idempotency-key-field.tsx#L6).
2. `createPortalSession`'s `execute()` hits a one-off Stripe 503; the gateway throws `ApplicationError('STRIPE_ERROR')`.
3. With no `shouldCacheError`, [`shouldCacheExecutionError`](../../src/adapters/shared/with-idempotency.ts#L67) returns `true` and the wrapper stores the error with `expiresAt = claim + DAY_MS` ([`with-idempotency.ts#L157-L162`](../../src/adapters/shared/with-idempotency.ts#L157-L162), `DEFAULT_TTL_MS = DAY_MS` at [L16](../../src/adapters/shared/with-idempotency.ts#L16)).
4. The action redirects to `/app/billing?error=portal_failed` ([`manage-billing-action.ts#L18`](<../../app/(app)/app/billing/manage-billing-action.ts#L18>)) — a client navigation; the layout does not remount, so the key is unchanged.
5. The user clicks the banner (or the `/app/billing` form) again. `withIdempotency`'s find-loop hits [`if (existing.error) throw`](../../src/adapters/shared/with-idempotency.ts#L308-L317) and replays the cached `STRIPE_ERROR` instantly, without contacting Stripe.

Expected: after a transient upstream failure, the retry re-executes against Stripe/the DB and succeeds.

Actual: the retry deterministically fails for up to 24h under that key — until the user hard-reloads (rotating the key) or the TTL lapses — with no UI hint that a reload recovers.

## Root Cause

- Default-cache policy: [`with-idempotency.ts#L67`](../../src/adapters/shared/with-idempotency.ts#L67) — `if (!shouldCacheError) return true;` means an omitted policy caches all errors, including transient `STRIPE_ERROR`/`INTERNAL_ERROR`.
- Durable replay: [`with-idempotency.ts#L308-L317`](../../src/adapters/shared/with-idempotency.ts#L308-L317) rethrows the cached error on every subsequent call with the same key, skipping `execute()`.
- Five un-policied call sites: [`billing-controller.ts#L141-L149`](../../src/adapters/controllers/billing-controller.ts#L141-L149), [`billing-controller.ts#L188-L196`](../../src/adapters/controllers/billing-controller.ts#L188-L196), [`bookmark-controller.ts#L103-L111`](../../src/adapters/controllers/bookmark-controller.ts#L103-L111), [`question-feedback-controller.ts#L154-L162`](../../src/adapters/controllers/question-feedback-controller.ts#L154-L162), [`question-feedback-controller.ts#L210-L219`](../../src/adapters/controllers/question-feedback-controller.ts#L210-L219).
- Non-rotating client keys on failure: [`idempotency-key-field.tsx#L6`](../../components/idempotency-key-field.tsx#L6) (mount-fixed for the form surfaces) and success-only rotation in [`bookmark-toggle.ts#L89-L91`](<../../app/(app)/app/shared/bookmark-toggle.ts#L89-L91>) / [`question-feedback-actions.ts#L91-L93`](<../../app/(app)/app/shared/question-feedback-actions.ts#L91-L93>) — both failure paths return earlier with the key unchanged.

**Refuted leg (not affected):** the sweep candidate also named `startPracticeSession`, but [`practice-page-session-start.ts#L107`](<../../app/(app)/app/practice/practice-page-session-start.ts#L107>) and [`#L116`](<../../app/(app)/app/practice/practice-page-session-start.ts#L116>) rotate the key on **both** failure paths (thrown error and `!res.ok`), so retries re-execute under fresh keys. Any fix should drop that surface from scope, or treat it only as harmless server-side residue (orphaned cached-error rows under abandoned keys).

## Impact

A single transient infra fault converts into up to 24h of deterministic failure on that surface for that user: the trial banner and billing portal (money path — a trial user trying to add a card cannot), the pricing checkout CTA, bookmark toggling, and question rating/reporting. Retries look like a persistent outage even though the upstream recovered immediately, and nothing in the UI suggests that a hard reload fixes it.

Severity rationale (P3, not the candidate's P2): unlike [BUG-278](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md)'s never-rotating `sessionId`-derived key (P2 — reload did not help and the poisoned session blocked all new practice starts for 24h), these keys rotate on hard reload/remount, so recovery exists but is undiscoverable; the trigger also requires a transient fault to land exactly during `execute()`. Comparable precedent [BUG-259](../_archive/bugs/bug-259-in-place-rate-limit-errors-cache-idempotency-retries.md) (cached `RATE_LIMITED` replay wedge, recoverable) was P4; this is worse (money-path surfaces, infra faults are not self-inflicted, recovery non-obvious) but not BUG-278-grade.

## Proposed Fix

1. **(RECOMMENDED)** Extend the DEBT-435/BUG-278 pattern to the five un-policied actions: pass per-surface `shouldCacheError` policies to `billing:createCheckoutSession`, `billing:createPortalSession`, `bookmark:setBookmark`, `question-feedback:rateQuestion`, and `question-feedback:submitQuestionReport` that cache only deterministic `ApplicationError`s (`VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, monotone `CONFLICT`) and never cache `STRIPE_ERROR`/`INTERNAL_ERROR`/unmapped errors — an uncached error aborts the claim so retries re-execute (existing wrapper behavior). Pin with per-surface regression tests mirroring `practice-controller-session-lifecycle-idempotency-policy.test.ts`.
2. **Defense in depth** (matches BUG-278's dual approach): rotate client keys on failure — [`bookmark-toggle.ts`](<../../app/(app)/app/shared/bookmark-toggle.ts#L89-L91>) and [`question-feedback-actions.ts`](<../../app/(app)/app/shared/question-feedback-actions.ts#L91-L93>) already have the `setKey`/`createKey` seams (move the rotation call into the failure paths too), and give the billing/pricing/bookmarks forms a rotate-on-error mechanism instead of a mount-fixed `IdempotencyKeyField`.
3. **(Larger change)** Flip the wrapper default to not-cache unmapped/`INTERNAL_ERROR` errors and make error caching opt-in per action — safest long-term semantics, but requires auditing every idempotent surface for double-execution tolerance in one pass.

Scope correction carried from verification: `startPracticeSession` must not be included in the fix scope (see the refuted leg above).

## Related

- [BUG-278 (archived)](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) — the same cache-transient-error mechanics on end/discard; its doc explicitly scoped itself to the abandonment actions ("this bug is scoped to the abandonment actions whose retry key is fixed to an existing incomplete session"), so these five surfaces are not a duplicate.
- [BUG-259 (archived)](../_archive/bugs/bug-259-in-place-rate-limit-errors-cache-idempotency-retries.md) — severity precedent: cached `RATE_LIMITED` replay wedge, P4.
- [DEBT-435 (archived)](../_archive/debt/debt-435-practice-session-conflict-and-test-hygiene-follow-ups.md) — added `shouldCacheError` policies to the practice state writes; this bug extends that pattern to the remaining surfaces.
- No active debt item covers the remaining surfaces.

Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
