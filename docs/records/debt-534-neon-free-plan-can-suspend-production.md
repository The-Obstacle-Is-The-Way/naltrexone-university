# DEBT-534: Neon's Free Plan Can Suspend Production's Database Until the Month Ends

**Status:** Open — the owner moves it to Neon Launch before the first live sale
**Priority:** P2
**Date:** 2026-10-21

---

## Summary

Production's Postgres is `naltrexone-db`, one Neon project that Vercel's Neon integration manages and bills. It is on Neon's Free plan, which gives the project 100 CU-hours of compute and 5 GB of public network transfer a month, and 1 GB of storage. If the compute or the transfer runs out, Neon suspends the compute until the next billing period or an upgrade, and every database-backed page and endpoint fails until then. Past 1 GB, every write that grows storage fails.

Preview and Development use the same project (its `dev` branch), so their traffic, and the ledger checks and migration every Preview build runs, spend the allowance that keeps production up.

## Evidence

- **The plan.** Vercel's storage API reported `naltrexone-db` on plan `free_v3`, available, with `usageQuotaExceeded: false`, on 2026-10-21 and again on 2026-10-24. It is connected to Production, Preview and Development.
- **The limits.** [Neon's plans page](https://neon.com/docs/introduction/plans): Free includes, per project, 100 CU-hours and 5 GB of public network transfer a month, 1 GB of storage, 10 branches and autoscaling up to 2 CU. Its FAQ says that on running out of CU-hours or transfer, "your compute is suspended until the next billing period or until you upgrade". Exceeding the storage cap makes inserts, updates and deletes fail, and branch creation fails at 10 branches. No limit deletes data, and the page describes no grace period.
- **One project for every environment.** `docs/architecture/environments.md`: Production uses the Neon `main` branch, and Preview and Development the `dev` branch, in one project. A value-free host check on 2026-10-21 found Preview and Development on one host and Production on another.
- **Recovery window.** The security program's 2026-08-13 check measured point-in-time restore at 6 hours, Free's maximum. Paid plans default to 1 day; Launch can keep up to 7 days, billed at $0.20 per GB-month.
- **Current load.** Before launch, the database serves two daily Vercel crons, each Preview and Production build's ledger checks and migration, health checks and the owner's own use; the scheduled smokes use a local database. Free suspends a compute after 5 idle minutes, and a suspended compute uses no CU-hours. Vercel's storage API does not report the month's usage; Vercel's Storage page and the Neon Console do.

## Impact

- **Outage.** If the month's CU-hours or transfer run out, practice, billing, the Stripe and Resend webhooks and the renewal-notice cron all fail together until the month ends or the plan changes. Static pages and Clerk's hosted sign-in keep working.
- **Writes.** At 1 GB, writes that grow storage fail.
- **Shared allowance.** A burst of Preview deployments or a load test spends production's compute.
- **Recovery.** A bad migration or seed noticed more than 6 hours later cannot be undone by point-in-time restore. Until the move, the database recovery guide's restore point, a manual snapshot taken just before a bulk write, covers a planned change; it cannot cover an unplanned one.
- **DEBT-445.** Free allows Preview branching but caps the project at 10 branches, `main` and `dev` included. At least 34 PR branches deployed Previews in each October week, so per-Preview branches on Free would have almost no headroom: a busy week or a missed cleanup would stop new Preview branches, and the merge guard needs every check green. DEBT-445 therefore waits for this move.

## Options

1. **Launch.** Usage-based with no monthly minimum: $0.106 per CU-hour, $0.35 per GB-month of storage, and up to 7 days of history at $0.20 per GB-month. It includes 10 branches, then $1.50 per extra branch-month. Neither compute nor storage is capped.
2. **Scale.** $0.222 per CU-hour, with up to 30 days of history and support tickets. Launch covers what this product needs.
3. **Stay on Free and watch usage.** Suspension is project-wide and immediate. Watching only shortens the reaction, and the remedy is still the upgrade.
4. **Split production into its own Free project.** That would separate Preview's spending, but production would still suspend at 100 CU-hours and keep the 6-hour recovery window.

## Resolution (decided)

**Option 1, Launch.** The owner confirmed the finding on 2026-10-21 and scheduled the move for before the first live sale, beside Vercel Pro (DEBT-512). Until then the owner accepts the suspension risk; nothing before launch promises uptime.

The move is made in Vercel: Storage → `naltrexone-db` → Settings → Change Configuration. The plan applies to every database in the integration, and there is one. Then, in the Neon Console, set the history window to 7 days, since paid plans default to 1 day, and set a spend alert. At rest, Launch bills only storage and history, so the owner may move earlier; the first live sale is the deadline.

## Verification

- [ ] Owner: Vercel's storage API or Storage page reads `naltrexone-db` on Launch.
- [ ] Owner: the history window reads 7 days.
- [ ] Owner: a spend alert covers the Neon charge, on Neon's Billing page if the Vercel-managed organization shows one, otherwise in Vercel; this record names which.
- [ ] Engineering: `/api/health` returns 200 after the change. The plan line in `docs/architecture/environments.md` and the windows in `docs/guides/operations/database-recovery.md` are updated, and DEBT-445's Waiting row is re-read, since this move clears its first prerequisite.

## Related

- DEBT-512: Vercel Pro, due at the same time.
- DEBT-445: per-Preview database branches, which wait for this move.
- [Neon's Vercel-managed integration](https://neon.com/docs/guides/vercel-managed-integration): where its plan is changed.
