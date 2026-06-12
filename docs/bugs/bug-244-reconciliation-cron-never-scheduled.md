# BUG-244: The Stripe Reconciliation Safety Net Never Runs — No Scheduler Invokes the Cron Route

**Status:** In Progress (implemented on `fix/bug-244-246-reconciliation-cron-and-deletion-drain`; pending PR review/merge)
**Priority:** P2 (the designed self-heal for duplicate subscriptions and drifted rows is dead; duplicates keep billing until noticed by hand)
**Date:** 2026-06-11
**Family:** Billing / reconciliation / deploy-infra
**Related:** [BUG-242](../_archive/bugs/bug-242-stale-subscription-webhook-overwrites-active-row.md) & [BUG-243](../_archive/bugs/bug-243-checkout-success-replay-overwrites-active-subscription.md) (the row corruptions reconciliation would heal), [BUG-245](./bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) (the duplicate subscriptions reconciliation would cancel), [BUG-241](./bug-241-deploy-pipeline-has-no-migration-step.md) (same class: a documented-but-unenforced ops step), [BUG-205](../_archive/bugs/bug-205-reconciliation-prefers-stale-local-subscription-over-canonical-stripe-state.md) / [BUG-120](../_archive/bugs/bug-120-reconciliation-missing-authoritative-conflict-strategy.md) / [DEBT-155](../_archive/debt/debt-155-stripe-legacy-duplicate-subscriptions-reconciliation.md) (fixes that all assume this job actually runs)

---

## Description

`reconcileStripeSubscriptions` exists to be the billing safety net: detect a user with multiple blocking Stripe subscriptions, pick the canonical winner, persist it, and cancel the duplicates; and heal local rows that drifted from Stripe. It has been hardened repeatedly (BUG-120 authoritative conflict strategy, BUG-205 canonical-winner selection, DEBT-155 legacy-duplicate cleanup). Before this fix, **nothing in the repository ever invoked it**: there was no Vercel cron configuration and no scheduled GitHub Action, so the route was never called in any environment except its own tests.

Two independent pre-fix facts made it dead in production:

1. **No scheduler existed.** There was no `vercel.json`/`vercel.ts` in the repo (so no `crons` block), and no workflow under `.github/workflows/` had a `schedule:` trigger that called the route. The spec documents the route and its rate limit (`docs/specs/spec-017-rate-limiting.md:33`) and lists `CRON_SECRET` as a production env var (`docs/specs/master_spec_part4.md:309`), but no doc wired an actual cadence.
2. **Even a manual call defaulted to a non-destructive dry run for duplicate cancellation.** The route's `dryRun` still intentionally defaults to `true` for rollout (`app/api/cron/reconcile-stripe-subscriptions/route.ts:153`), and duplicate cancellation (phase 5) only runs when `dryRun === false` (`src/adapters/jobs/reconcile-stripe-subscriptions.ts:239-262`). The canonical-winner **upsert (phase 4) runs regardless of `dryRun`** (`:221-235`), so a one-off `POST … ?dryRun=false` would both heal rows and cancel duplicates — but absent a scheduler this never happened automatically.

Additionally, Vercel native cron jobs issue **GET** requests, while the route exported **POST only** pre-fix, so even adding a bare `vercel.json` cron entry would not have driven it without a method change. The implementation adds a thin `GET` handler that reuses the same auth/rate-limit/work path as `POST` (`app/api/cron/reconcile-stripe-subscriptions/route.ts:252-257`).

## Original Steps to Reproduce (pre-fix; no longer true on this branch)

1. On the base commit before this fix, `rg -n "schedule:" .github/workflows/` had no match invoking the reconcile route.
2. On the base commit before this fix, `ls vercel.json vercel.ts` found neither file.
3. On the base commit before this fix, `rg "export (async )?function (GET|POST)" app/api/cron/reconcile-stripe-subscriptions/route.ts` found only `POST`.
4. On this branch, the expected state is inverted: `vercel.json:3-8` registers a cron, and `route.ts:252-257` exports both `GET` and `POST`.

## Root Cause (pre-fix)

- The route exported `POST` only; current code fixes this with shared `GET`/`POST` exports (`app/api/cron/reconcile-stripe-subscriptions/route.ts:252-257`) while preserving the intentional `dryRun=true` default (`:153`).
- `src/adapters/jobs/reconcile-stripe-subscriptions.ts:221-235` (phase 4 upsert, always) vs `:237-262` (phase 5 cancel, `dryRun`-gated).
- No `vercel.json`/`vercel.ts` `crons` and no `.github/workflows/*.yml` `schedule:` step references the route — the wiring that would call it was never added.

This is the BUG-241 pattern applied to billing reconciliation: a correct, tested capability whose *invocation* is a documented-but-unenforced human/ops step, so it silently never executes.

## Impact

- Duplicate active subscriptions (the kind BUG-245 can create, or any double-checkout) are **never** auto-canceled, so a doubly-charged user keeps paying both until the owner notices by hand. That is money moving wrong on an ongoing basis.
- Drifted local rows that the job would heal (including the BUG-242 / BUG-243 corrupted-row lockouts) never get the periodic correction the architecture assumes — those users stay locked out until an unrelated webhook happens to rewrite the row.
- Several prior fixes (BUG-120, BUG-205, DEBT-155) are effectively inert in production because their only runtime path is this unscheduled job.

## Implemented Resolution

The chosen path is Vercel cron plus a thin `GET` handler, with `POST` preserved for manual/operator runs:

1. `vercel.json:3-8` registers a daily UTC cron at `/api/cron/reconcile-stripe-subscriptions?dryRun=true`, intentionally starting in dry-run for owner observation.
2. `app/api/cron/reconcile-stripe-subscriptions/route.ts:252-257` now exports `GET` and `POST`, both delegating to the same handler. The handler keeps the bearer-token check (`:73-109`) and rate limit (`:111-128`) before any reconciliation or drain work.
3. The handler still defaults `dryRun=true`; duplicate cancellation remains `dryRun=false`-gated in phase 5. The owner flips the cron path to `dryRun=false` only after reviewing one scheduled dry-run report in production logs.
4. The same scheduled run also drains stale `pending_stripe_cancellations` rows (BUG-246) so there is one billing-maintenance scheduler instead of parallel cron mechanisms.

Rejected alternative: a scheduled GitHub Action was rejected because Vercel is the deploy target and Vercel cron already supplies authenticated GET invocations via `CRON_SECRET`.

## Original Fix Options (superseded)

1. **Vercel cron (preferred if deploying on Vercel).** Add a `crons` entry (in `vercel.json` or `vercel.ts`) on a sensible cadence (e.g. hourly/daily), and adapt the route to accept Vercel's authenticated **GET** (Vercel sends `Authorization: Bearer $CRON_SECRET`) — or add a thin `GET` handler that calls the same logic. Invoke with an explicit, bounded `dryRun=false` once observed safe in dry-run.
2. **Scheduled GitHub Action.** A `schedule:`-triggered workflow that `POST`s the route with the `CRON_SECRET` bearer token and `?dryRun=false&limit=…`, paginating `offset`. Keeps the route POST-only.
3. Either way: start in `dryRun=true` for one cycle, review the logged duplicate/heal report, then flip to `dryRun=false`; document the cadence and the canceled-duplicate refund policy (see Surfaces — phase 5 cancels with no proration/refund handling).

## Verification

- [x] Code-level wiring: `GET` and `POST` both call the same authenticated reconciliation path; invalid/missing bearer tokens do not run reconciliation.
- [x] Re-running remains idempotent (canonical upsert is a no-op when already converged; duplicate cancel is `idempotencyKey`-guarded at `reconcile-stripe-subscriptions.ts:245-247`).
- [x] Existing reconcile regression coverage still proves a seeded duplicate-subscription fixture is reduced to one blocking subscription after a `dryRun=false` run.
- [ ] Post-deploy: a scheduled invocation appears in Vercel runtime logs on cadence with a 200 and a non-error `{ scanned, updated, failed, pendingStripeCancellations }` report. This cannot be proven in CI.
- [ ] Post-deploy: owner reviews one `dryRun=true` scheduled report, then flips the cron path to `dryRun=false` and redeploys.
- [ ] `CRON_SECRET` is present in the target environment (already required by `master_spec_part4.md:309`).

## Surfaces Confirmed

- The job logic itself is correct and tested; the fixed gap was strictly the absence of any scheduled caller (and the GET/POST method mismatch a Vercel cron would hit).
- Phase 5 cancels duplicate subscriptions immediately with no proration/refund handling (`reconcile-stripe-subscriptions.ts:242-249`); when this job is finally wired up, a double-charged user keeps both charges unless refunds are handled operationally — call this out in the runbook for the fix.
- Cron auth ordering (secret check before any work, timing-safe compare) is correct and not a regression of BUG-207.
