# BUG-289: Default Idempotency Policy Caches Transient Errors on Billing/Bookmark/Feedback Actions Whose Client Keys Do Not Rotate on Failure

**Status:** Open
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing)
**Component:** Idempotency / billing / bookmarks / feedback

---

## Summary

`withIdempotency`'s default error policy durably caches **every** `execute()` error for the 24h TTL: [`shouldCacheExecutionError`](../../src/adapters/shared/with-idempotency.ts#L63-L75) returns `true` whenever no `shouldCacheError` policy is passed, and the wait loop [replays `existing.error`](../../src/adapters/shared/with-idempotency.ts#L308-L317) as a fresh `ApplicationError` without re-executing. BUG-278 fixed this on the end/discard abandonment actions and DEBT-435 exempted one typed practice-state conflict, but five idempotent actions still pass no `shouldCacheError`: [`billing:createCheckoutSession`](../../src/adapters/controllers/billing-controller.ts#L141-L149), [`billing:createPortalSession`](../../src/adapters/controllers/billing-controller.ts#L188-L196), [`bookmark:setBookmark`](../../src/adapters/controllers/bookmark-controller.ts#L103-L111), [`question-feedback:rateQuestion`](../../src/adapters/controllers/question-feedback-controller.ts#L154-L162), and [`question-feedback:submitQuestionReport`](../../src/adapters/controllers/question-feedback-controller.ts#L210-L219). The report action's `outcomeStoreFailurePolicy` is a separate knob governing a failed `storeResult` after success; it does not classify `execute()` errors.

The corresponding clients do not explicitly rotate a failed key. [`IdempotencyKeyField`](../../components/idempotency-key-field.tsx#L5-L7) creates one key per mounted field and is used by the trial-countdown banner ([`layout.tsx#L139-L140`](<../../app/(app)/app/layout.tsx#L139-L140>)), the [`/app/billing`](<../../app/(app)/app/billing/page.tsx#L84-L89>) and [`/app/bookmarks`](<../../app/(app)/app/bookmarks/page.tsx#L55-L59>) forms, and the pricing checkout CTA ([`pricing-auth-cta.tsx#L32-L36`](../../app/pricing/pricing-auth-cta.tsx#L32-L36)). This repo enables [`cacheComponents`](../../next.config.ts#L4); Next.js documents that this preserves client state across client-side navigations ([official guide](https://nextjs.org/docs/app/guides/preserving-ui-state)), while the trial banner additionally lives in a shared layout that remains mounted across `/app/*` navigation. The in-place bookmark and rating/report helpers persist a generated key before the request and rotate it **only on success** ([`bookmark-toggle.ts#L34-L39`](<../../app/(app)/app/shared/bookmark-toggle.ts#L34-L39>), [`#L89-L91`](<../../app/(app)/app/shared/bookmark-toggle.ts#L89-L91>), [`question-feedback-actions.ts#L40-L45`](<../../app/(app)/app/shared/question-feedback-actions.ts#L40-L45>), [`#L90-L93`](<../../app/(app)/app/shared/question-feedback-actions.ts#L90-L93>), [`#L113-L118`](<../../app/(app)/app/shared/question-feedback-actions.ts#L113-L118>), [`#L163-L165`](<../../app/(app)/app/shared/question-feedback-actions.ts#L163-L165>)). A cached transient execution failure therefore replays under that same mounted/in-place key until a success-independent remount, hard reload, explicit alternate key, or TTL expiry.

## Reachability

Any signed-in user of the five surfaces, whenever a transient infrastructure fault lands exactly during `execute()`:

- **Trial-countdown banner** ("Add a card to keep access") — rendered by the persistent `app/(app)/app/layout.tsx`, so its `IdempotencyKeyField` survives navigation within the app subtree.
- **`/app/billing` "Manage billing"**, the **pricing checkout CTA**, and the **bookmarks removal forms** — each field is mount-scoped rather than failure-rotated; a remount or hard reload creates a new key.
- **In-place bookmark toggle and question rating/report** — the helper-owned key maps rotate only after success.

Preconditions: a one-off failure inside the wrapped `execute()` and a successful `storeError` write. A Stripe 5xx is retried by [`callStripeWithRetry`](../../src/adapters/gateways/stripe/stripe-retry.ts#L34-L60); if all attempts fail, [`retry`](../../src/adapters/shared/retry.ts#L90-L97) rethrows the raw SDK error, which `toErrorRecord` stores as `INTERNAL_ERROR`. The circuit breaker's open-state error is an `ApplicationError('STRIPE_ERROR')`. A transient DB fault is reachable when the business query fails but the subsequent idempotency-store write succeeds.

## Reproduction

Portal-session interleaving (the trial-banner scenario; the other four surfaces follow the same mechanics):

1. A trial user clicks "Add a card to keep access" on the trial banner ([`layout.tsx#L139-L140`](<../../app/(app)/app/layout.tsx#L139-L140>)); the form submits the mount-fixed key from [`idempotency-key-field.tsx#L6`](../../components/idempotency-key-field.tsx#L6).
2. `createPortalSession`'s Stripe call exhausts its retries on a transient 503. The raw SDK error escapes `retry`; `withIdempotency` classifies it as cacheable by default and `toErrorRecord` normalizes it to `INTERNAL_ERROR`. (If the circuit is already open, the cached code is `STRIPE_ERROR` instead.)
3. With no `shouldCacheError`, [`shouldCacheExecutionError`](../../src/adapters/shared/with-idempotency.ts#L63-L75) returns `true` and the wrapper stores the error with `expiresAt = claim-time + DAY_MS` ([`with-idempotency.ts#L156-L164`](../../src/adapters/shared/with-idempotency.ts#L156-L164), `DEFAULT_TTL_MS = DAY_MS` at [L16](../../src/adapters/shared/with-idempotency.ts#L16)).
4. The action redirects to `/app/billing?error=portal_failed` ([`manage-billing-action.ts#L18`](<../../app/(app)/app/billing/manage-billing-action.ts#L18>)) — a client navigation; the layout does not remount, so the key is unchanged.
5. The user clicks the **banner** again. `withIdempotency`'s find loop hits [`if (existing.error) throw`](../../src/adapters/shared/with-idempotency.ts#L308-L317) and replays the cached error without contacting Stripe. The separately rendered `/app/billing` form owns a different `IdempotencyKeyField`; it is an alternate-key escape from a banner-poisoned key, not a replay of that key.

Expected: after a transient upstream failure, the retry re-executes against Stripe/the DB and succeeds.

Actual: a retry under the same key deterministically fails for the row's remaining TTL. A hard reload/remount or, in the banner scenario, the billing page's separate form creates an alternate key, but the UI does not explain that distinction.

## Root Cause

- Default-cache policy: [`with-idempotency.ts#L63-L75`](../../src/adapters/shared/with-idempotency.ts#L63-L75) — `if (!shouldCacheError) return true;` means an omitted policy caches all execute errors, including raw errors normalized to `INTERNAL_ERROR` and typed `STRIPE_ERROR`.
- Durable replay: [`with-idempotency.ts#L308-L317`](../../src/adapters/shared/with-idempotency.ts#L308-L317) rethrows the cached error on every subsequent call with the same key, skipping `execute()`.
- Five un-policied call sites: [`billing-controller.ts#L141-L149`](../../src/adapters/controllers/billing-controller.ts#L141-L149), [`billing-controller.ts#L188-L196`](../../src/adapters/controllers/billing-controller.ts#L188-L196), [`bookmark-controller.ts#L103-L111`](../../src/adapters/controllers/bookmark-controller.ts#L103-L111), [`question-feedback-controller.ts#L154-L162`](../../src/adapters/controllers/question-feedback-controller.ts#L154-L162), [`question-feedback-controller.ts#L210-L219`](../../src/adapters/controllers/question-feedback-controller.ts#L210-L219).
- Non-rotating client keys on failure: [`idempotency-key-field.tsx#L5-L7`](../../components/idempotency-key-field.tsx#L5-L7) is mount-fixed for form surfaces; the bookmark/rating/report helpers return from both thrown and non-ok paths before their success-only rotation sites.

**Refuted leg (not affected by this same-key replay):** the sweep candidate also named `startPracticeSession`, but [`practice-page-session-start.ts#L107`](<../../app/(app)/app/practice/practice-page-session-start.ts#L107>) and [`#L116`](<../../app/(app)/app/practice/practice-page-session-start.ts#L116>) rotate the key on **both** failure paths (thrown error and `!res.ok`), so the failed key is not reused. Indeterminate start outcomes are not harmless, but they produce the different lost-result/incomplete-session mechanism tracked by [BUG-291](./bug-291-session-start-key-rotation-on-timeout-conflict-dead-end.md), not this doc's cached-error replay loop.

## Impact

A single transient infrastructure fault converts into deterministic replay failure for the remaining lifetime of that key: trial-banner and billing/checkout money paths, bookmark writes, and rating/reporting. Retries can look like a persistent outage after the upstream recovers. Recovery is available through a hard reload/remount; the trial-banner scenario also exposes the billing page's independently keyed form. Neither recovery mechanism is explained to the user.

Severity rationale (P3, not the candidate's P2): unlike [BUG-278](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md)'s never-rotating `sessionId`-derived key (P2 — reload did not help and the poisoned session blocked all new practice starts for 24h), these keys rotate on hard reload/remount, so recovery exists but is undiscoverable; the trigger also requires a transient fault to land exactly during `execute()`. Comparable precedent [BUG-259](../_archive/bugs/bug-259-in-place-rate-limit-errors-cache-idempotency-retries.md) (cached `RATE_LIMITED` replay wedge, recoverable) was P4; this is worse (money-path surfaces, infra faults are not self-inflicted, recovery non-obvious) but not BUG-278-grade.

## Proposed Fix

1. **(RECOMMENDED)** Add explicit, per-action `shouldCacheError` policies rather than relying on the cache-all default. Checkout and portal retries are protected at the Stripe seam (portal forwards the request key; checkout derives deterministic user/plan keys), and bookmark writes express a desired state, so raw/unmapped, `STRIPE_ERROR`, and `INTERNAL_ERROR` execution failures on those actions can abort the fenced claim and re-execute. Cache only specifically audited, semantically stable outcomes; do not use nonexistent codes such as `UNAUTHORIZED`, and do not treat all `NOT_FOUND`/`CONFLICT` values as monotone by code alone.
2. **Feedback prerequisite:** rating/report writes append `question_feedback` rows and currently store no request key. Before making outcome-indeterminate feedback failures broadly retryable, persist a request-level idempotency token (or transactionally couple the business row and idempotency outcome) so a connection loss around commit cannot duplicate an event. The existing report `outcomeStoreFailurePolicy` covers only `storeResult` failing **after `execute()` returned**; it does not resolve an ambiguous failure from the append itself.
3. **Defense in depth:** rotate client keys after a **determinate** non-ok `ActionResult`. Preserve the key for thrown transport/timeouts, where the server may still complete, and for `ConcurrentRequestInProgress`; blanket rotation in every catch would recreate BUG-291's determinacy error. Form surfaces need an explicit reset/remount mechanism only if the primary server policy is not sufficient.
4. **(Larger change)** Flip the wrapper default to opt-in error caching only after auditing every action's ambiguous-commit and double-execution behavior. The wrapper cannot infer replay safety from `INTERNAL_ERROR` alone.

Scope correction carried from verification: `startPracticeSession` must not be included in the fix scope (see the refuted leg above).

## Related

- [BUG-278 (archived)](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) — the same cache-transient-error mechanics on end/discard; its doc explicitly scoped itself to the abandonment actions ("this bug is scoped to the abandonment actions whose retry key is fixed to an existing incomplete session"), so these five surfaces are not a duplicate.
- [BUG-259 (archived)](../_archive/bugs/bug-259-in-place-rate-limit-errors-cache-idempotency-retries.md) — severity precedent: cached `RATE_LIMITED` replay wedge, P4.
- [BUG-291](./bug-291-session-start-key-rotation-on-timeout-conflict-dead-end.md) — explains why start's failure rotation avoids this same-key replay but is itself wrong for indeterminate outcomes.
- [DEBT-435 (archived)](../_archive/debt/debt-435-practice-session-conflict-and-test-hygiene-follow-ups.md) — added `shouldCacheError` policies to the practice state writes; this bug extends that pattern to the remaining surfaces.
- No active debt item covers the remaining surfaces.

Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
