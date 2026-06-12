# BUG-244: The Stripe Reconciliation Safety Net Never Runs — No Scheduler Invokes the Cron Route

**Status:** Open
**Priority:** P2 (the designed self-heal for duplicate subscriptions and drifted rows is dead; duplicates keep billing until noticed by hand)
**Date:** 2026-06-11
**Family:** Billing / reconciliation / deploy-infra
**Related:** [BUG-242](../_archive/bugs/bug-242-stale-subscription-webhook-overwrites-active-row.md) & [BUG-243](../_archive/bugs/bug-243-checkout-success-replay-overwrites-active-subscription.md) (the row corruptions reconciliation would heal), [BUG-245](./bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) (the duplicate subscriptions reconciliation would cancel), [BUG-241](./bug-241-deploy-pipeline-has-no-migration-step.md) (same class: a documented-but-unenforced ops step), [BUG-205](../_archive/bugs/bug-205-reconciliation-prefers-stale-local-subscription-over-canonical-stripe-state.md) / [BUG-120](../_archive/bugs/bug-120-reconciliation-missing-authoritative-conflict-strategy.md) / [DEBT-155](../_archive/debt/debt-155-stripe-legacy-duplicate-subscriptions-reconciliation.md) (fixes that all assume this job actually runs)

---

## Description

`reconcileStripeSubscriptions` exists to be the billing safety net: detect a user with multiple blocking Stripe subscriptions, pick the canonical winner, persist it, and cancel the duplicates; and heal local rows that drifted from Stripe. It has been hardened repeatedly (BUG-120 authoritative conflict strategy, BUG-205 canonical-winner selection, DEBT-155 legacy-duplicate cleanup). But **nothing in the repository ever invokes it.** There is no Vercel cron configuration and no scheduled GitHub Action, so the route is never called in any environment except its own tests.

Two independent facts make it dead in production:

1. **No scheduler exists.** There is no `vercel.json`/`vercel.ts` in the repo (so no `crons` block), and no workflow under `.github/workflows/` has a `schedule:` trigger that calls the route. The spec documents the route and its rate limit (`docs/specs/spec-017-rate-limiting.md:33`) and lists `CRON_SECRET` as a production env var (`docs/specs/master_spec_part4.md:309`), but no doc wires an actual cadence.
2. **Even a manual call defaults to a non-destructive dry run for duplicate cancellation.** The route's `dryRun` defaults to `true` (`app/api/cron/reconcile-stripe-subscriptions/route.ts:148`), and duplicate cancellation (phase 5) only runs when `dryRun === false` (`src/adapters/jobs/reconcile-stripe-subscriptions.ts:239-262`). The canonical-winner **upsert (phase 4) runs regardless of `dryRun`** (`:221-235`), so a one-off `POST … ?dryRun=false` would both heal rows and cancel duplicates — but absent a scheduler this never happens automatically.

Additionally, Vercel native cron jobs issue **GET** requests, while the route exports **POST only** (`route.ts:65`), so even adding a bare `vercel.json` cron entry would not drive it without a method change — worth noting so the fix is not mis-scoped.

## Steps to Reproduce

1. `rg -n "schedule:" .github/workflows/` → no match invoking the reconcile route.
2. `ls vercel.json vercel.ts` → neither exists (no `crons`).
3. `rg "export (async )?function (GET|POST)" app/api/cron/reconcile-stripe-subscriptions/route.ts` → only `POST`.
4. Conclude: in production the job is unreachable by any automated caller; the only invocations are unit tests (`route.test.ts`, `reconcile-stripe-subscriptions.test.ts`).

## Root Cause

- `app/api/cron/reconcile-stripe-subscriptions/route.ts:65` exports `POST` only; `:148` defaults `dryRun` to `true`.
- `src/adapters/jobs/reconcile-stripe-subscriptions.ts:221-235` (phase 4 upsert, always) vs `:237-262` (phase 5 cancel, `dryRun`-gated).
- No `vercel.json`/`vercel.ts` `crons` and no `.github/workflows/*.yml` `schedule:` step references the route — the wiring that would call it was never added.

This is the BUG-241 pattern applied to billing reconciliation: a correct, tested capability whose *invocation* is a documented-but-unenforced human/ops step, so it silently never executes.

## Impact

- Duplicate active subscriptions (the kind BUG-245 can create, or any double-checkout) are **never** auto-canceled, so a doubly-charged user keeps paying both until the owner notices by hand. That is money moving wrong on an ongoing basis.
- Drifted local rows that the job would heal (including the BUG-242 / BUG-243 corrupted-row lockouts) never get the periodic correction the architecture assumes — those users stay locked out until an unrelated webhook happens to rewrite the row.
- Several prior fixes (BUG-120, BUG-205, DEBT-155) are effectively inert in production because their only runtime path is this unscheduled job.

## Expected Fix (options — pick per ops constraints)

1. **Vercel cron (preferred if deploying on Vercel).** Add a `crons` entry (in `vercel.json` or `vercel.ts`) on a sensible cadence (e.g. hourly/daily), and adapt the route to accept Vercel's authenticated **GET** (Vercel sends `Authorization: Bearer $CRON_SECRET`) — or add a thin `GET` handler that calls the same logic. Invoke with an explicit, bounded `dryRun=false` once observed safe in dry-run.
2. **Scheduled GitHub Action.** A `schedule:`-triggered workflow that `POST`s the route with the `CRON_SECRET` bearer token and `?dryRun=false&limit=…`, paginating `offset`. Keeps the route POST-only.
3. Either way: start in `dryRun=true` for one cycle, review the logged duplicate/heal report, then flip to `dryRun=false`; document the cadence and the canceled-duplicate refund policy (see Surfaces — phase 5 cancels with no proration/refund handling).

## Verification

- [ ] After wiring: a scheduled invocation appears in deploy/runtime logs on cadence with a 200 and a non-error `{ scanned, updated, failed }` report.
- [ ] Re-running is idempotent (canonical upsert is a no-op when already converged; duplicate cancel is `idempotencyKey`-guarded at `reconcile-stripe-subscriptions.ts:245-247`).
- [ ] A seeded duplicate-subscription fixture is reduced to one blocking subscription after a `dryRun=false` run.
- [ ] `CRON_SECRET` is present in the target environment (already required by `master_spec_part4.md:309`).

## Surfaces Confirmed

- The job logic itself is correct and tested; the gap is strictly the absence of any scheduled caller (and the GET/POST method mismatch a Vercel cron would hit).
- Phase 5 cancels duplicate subscriptions immediately with no proration/refund handling (`reconcile-stripe-subscriptions.ts:242-249`); when this job is finally wired up, a double-charged user keeps both charges unless refunds are handled operationally — call this out in the runbook for the fix.
- Cron auth ordering (secret check before any work, timing-safe compare) is correct and not a regression of BUG-207.
