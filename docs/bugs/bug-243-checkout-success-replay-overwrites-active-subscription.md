# BUG-243: Revisiting a Stale `/checkout/success` URL Overwrites the Newer Active Subscription With the Old Canceled One (Eager Sync Writes Before It Checks)

**Status:** In Progress — fix implemented in `fix/bug-242-243-subscription-identity-recency-guard` (pending owner grade / merge)
**Priority:** P2 (user-deterministic lockout of a paying user; borderline P1 — every trial-converted user permanently carries the trigger URL in browser history)
**Date:** 2026-06-11
**Family:** Billing / checkout-success eager sync
**Related:** [BUG-242](./bug-242-stale-subscription-webhook-overwrites-active-row.md) (same missing identity/recency guard, webhook entry point), [BUG-053](../_archive/bugs/bug-053-checkout-success-missing-user-id-metadata.md) (cross-*account* guard — passes here because it is the same user), [BUG-099](../_archive/bugs/bug-099-checkout-success-race-concurrent-webhook-conflict.md) (same-checkout webhook race — different mode), [BUG-221](../_archive/bugs/bug-221-checkout-success-repeated-session-id-breaks-sync.md) (param shape, not staleness), ADR-014 (eager sync pattern — "idempotent" only for the fresh-checkout shape)

---

## Description

The checkout-success page runs an eager Stripe→DB sync on **every** render of `/checkout/success?session_id=…`, and the synced state is **upserted before any freshness, terminal-status, or row-identity check**. Completed Stripe Checkout Sessions remain retrievable long after completion (the 24-hour expiry applies to open sessions), and every success URL — `?session_id=<concrete id>` substituted by Stripe — lives on in the user's browser history.

So a user whose history contains the success URL of a **superseded** checkout (the universal DEBT-410 lineage: no-card trial sub A, auto-canceled at trial end, then paid sub B; or any cancel→resubscribe) can, by revisiting that URL (history autocomplete for "checkout", session/tab restore, an old bookmarked confirmation tab), make the app retrieve old sub A's live state — `canceled` — and overwrite the row that correctly pointed at active sub B. The page then redirects them to pricing as non-entitled, and they are locked out exactly as in BUG-242, while Stripe keeps billing sub B.

Unlike BUG-242 this needs **no webhook timing at all**: it is user-deterministic and reproducible on demand. An event-recency fix scoped to the webhook path would not cover this entry point.

## Steps to Reproduce

1. Start a no-card trial (sub A); let it lapse with no card → A is `canceled`. Subscribe (sub B, `active`). Local row = (B, `active`, future period end).
2. Open the **old** success URL from browser history: `/checkout/success?session_id=<session of A's checkout>`.
3. Observe the redirect to `/pricing?reason=subscription_required` and the row now = (A, `canceled`, A's past period end). All `/app/*` routes bounce; Subscribe bounces to `?reason=manage_billing` (gateway sees active B → `ALREADY_SUBSCRIBED`).

## Root Cause

1. `app/(marketing)/checkout/success/page.tsx:43` — `runCheckoutSuccessPage` calls `syncCheckoutSuccess({ sessionId })` on every server render with the raw query param. Page renders are not events: the `stripe_events` dedup never engages, and there is no once-only guard.
2. `app/(marketing)/checkout/success/checkout-success-sync.tsx:138-148` — retrieves the session; **no `session.status` or created-at freshness check**.
3. `checkout-success-sync.tsx:150-162` — extracts old customer + subscription (A) ids; both assertions pass on any completed subscription checkout.
4. `checkout-success-sync.tsx:164-185` — retrieves sub A's live state (`canceled`); the only ownership guard is `metadata.user_id === user.id` (`:179-185`), which **passes** because A belongs to the same user. (BUG-053's cross-account protection is orthogonal.)
5. `checkout-success-sync.tsx:187-237` — `canceled` is a valid Stripe status, so status validation passes; plan mapping passes. There is no terminal-status or row-identity guard.
6. `checkout-success-sync.tsx:241-253` — the transaction **upserts (A, `canceled`, stale period end) first**; only afterwards (`:255-266`) does it compute entitlement and redirect. The damage is committed before the "non-entitled" branch runs.
7. `src/adapters/repositories/drizzle-subscription-repository.ts:89-99` — same userId-keyed last-write-wins upsert as BUG-242 replaces the active sub-B row.
8. Lockout + no-self-service-recovery chain is identical to BUG-242 steps 4–6 (`app/(app)/app/layout.tsx:33-52` → `create-checkout-session.ts:112-122` → `stripe-checkout-sessions.ts:151-191` `ALREADY_SUBSCRIBED` → `subscribe-action.ts:35-37` manage-billing loop). Depending on whether A's stale period end has passed, the pricing reason is `subscription_required` (usual; "Your access ended") or `subscription_canceled`.

Coverage gap that let this ship: every test in `app/(marketing)/checkout/success/page.test.ts` starts from an **empty** `FakeSubscriptionRepository` (no test pre-seeds a newer active row before syncing a canceled session — zero `subscriptions.upsert(` arrange calls in the file), so the clobber path is unexamined rather than encoded-intentional.

## Impact

- A paying user can lock **themselves** out instantly and reproducibly, with the same no-self-service-recovery loop as BUG-242 (heals only on the next sub-B webhook — up to ~30 days monthly / ~1 year annual — or manual intervention).
- The trigger artifact is permanent and universal: every trial-converted user's history contains a superseded success URL forever. Tab-restore and URL-bar autocomplete make accidental revisits realistic, not adversarial.
- Scope note: the replay persists whatever sub A's *current* live state is, so the canceled-A case above is the real trigger. A still inside its cancel-at-period-end window (status `active`) only matters here if a newer active sub B already coexists with the still-active A — which itself requires the concurrent-duplicate path ([BUG-245](./bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md)), since an otherwise-active A would block B's creation (`src/application/use-cases/create-checkout-session.ts:113-122`). It is a compounding edge, not an independent trigger.

## Implemented Fix

The durable layer is the same shared domain write policy as BUG-242: `shouldPersistSubscriptionWrite` (`src/domain/services/subscription-write-guard.ts:25-42`) is called by both the Drizzle repository (`src/adapters/repositories/drizzle-subscription-repository.ts:81-128`) and `FakeSubscriptionRepository` (`src/application/test-helpers/fakes/fake-subscription-repository.ts:64-86`). That prevents the stale success render from corrupting the one-row subscription projection.

Checkout-success also consumes the new `SubscriptionRepository.upsert` result (`src/application/ports/subscription-repository.ts:16-27`). If a stale terminal write is skipped, `syncCheckoutSuccess` computes entitlement and the interstitial/redirect outcome from the protected current row instead of the stale retrieved subscription (`app/(marketing)/checkout/success/checkout-success-sync.tsx:241-281`). That is the BUG-243-specific piece: the row stays current *and* the user is not redirected to pricing.

Rejected alternatives:
- Entry-point-only guard: rejected because it would leave webhook and reconcile/fake parity dependent on duplicate local policy.
- Stripe `created` timestamp freshness: rejected for this fix because the confirmed replay regression is a terminal superseded-subscription overwrite, which the shared identity + terminal-state guard blocks without broadening Stripe DTOs.
- Session age cap: rejected as optional hardening; it would not be the durable fix for webhook-originated stale writes.

## Verification

- [x] Unit test in `page.test.ts`: pre-seed (B, `active`, future period), sync an old session whose subscription is canceled A → row still B, `syncCheckoutSuccess` resolves entitled, and pricing redirect is not called (`app/(marketing)/checkout/success/page.test.ts:1109-1194`).
- [x] Fresh-checkout sync/interstitial tests remain covered in the same page test file (`app/(marketing)/checkout/success/page.test.ts:270-363,1196-1291`).
- [x] Shared fake and Drizzle guard tests prove the skipped write keeps B and same-subscription active→canceled still persists (`src/application/test-helpers/fakes/fake-subscription-repository.test.ts:70-122`; `tests/integration/stripe-repositories.integration.test.ts:189-272`).
- [x] Focused verification green: `pnpm test --run src/domain/services/subscription-write-guard.test.ts src/application/test-helpers/fakes/fake-subscription-repository.test.ts src/adapters/controllers/stripe-webhook-controller.test.ts app/(marketing)/checkout/success/page.test.ts src/adapters/jobs/reconcile-stripe-subscriptions.test.ts src/adapters/repositories/drizzle-subscription-repository.test.ts` and `pnpm test:integration --run tests/integration/stripe-repositories.integration.test.ts`.

## Surfaces Confirmed

- The sync's existing guards are all orthogonal to this bug and remain correct: missing/array `session_id` (BUG-221), foreign-account session (`user_id_mismatch`, BUG-053), malformed status, unknown price.
- The DEBT-412 interstitial behavior for *fresh* checkouts is unaffected by the proposed guard.
- Three production writers feed `subscriptions.upsert` (webhook controller `:132`, reconcile job `:227`, eager sync `:245`); this and BUG-242 cover the two that can carry superseded-subscription state; the reconciler computes a canonical winner first and is safe by construction.
