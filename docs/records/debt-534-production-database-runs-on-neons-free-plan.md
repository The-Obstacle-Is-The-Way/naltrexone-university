# DEBT-534: Production's Database Runs on Neon's Free Plan, Which Suspends It When the Month's Compute Runs Out

**Status:** Open — the owner moves the database to Neon's Launch plan before the first live sale, with Vercel Pro (DEBT-512)
**Priority:** P2
**Date:** 2026-10-21

---

## Summary

Production's Postgres is `naltrexone-db`, one Neon project that Vercel's Neon integration manages and bills. It is on Neon's Free plan. Free gives the project 100 CU-hours of compute a month and 1 GB of storage. When the compute runs out, Neon suspends it until the next billing period or an upgrade, so production stops serving for the rest of the month. Past 1 GB, every write that grows storage fails.

Preview and Development use the same project (its `dev` branch), so their traffic, and the migration every Preview build runs, spend the allowance that keeps production up.

## Evidence

- **The plan.** Vercel's storage API reported `naltrexone-db` on plan `free_v3`, available, with `usageQuotaExceeded: false`, on 2026-10-21 and again on 2026-10-24. It is connected to Production, Preview and Development.
- **The limits.** [Neon's plans page](https://neon.com/docs/introduction/plans): Free includes 100 CU-hours per project per month, 1 GB of storage per project, 10 branches per project and autoscaling up to 2 CU. Its FAQ: on running out of CU-hours, "your compute is suspended until the next billing period or until you upgrade". Exceeding the storage cap makes inserts, updates and deletes fail, and branch creation fails at 10 branches. No limit deletes data.
- **One project for every environment.** `docs/architecture/environments.md`: Production uses the Neon `main` branch, and Preview and Development the `dev` branch, in one project. A value-free host check on 2026-10-21 found Preview and Development on one host and Production on another.
- **Recovery window.** The security program's 2026-08-13 check measured point-in-time restore at 6 hours, Free's maximum. Launch keeps up to 7 days.
- **Current load.** Before launch, the database serves two daily Vercel crons, the scheduled smokes, each Preview build's migration and the owner's own use. Free suspends a compute after 5 idle minutes, and a suspended compute uses no CU-hours. Neither Vercel's API nor this repository reads the month's CU-hours; the Neon Console, opened from Vercel Storage, shows them.

## Impact

- **Outage.** If the month's CU-hours run out, production's database stops until the month ends or the plan changes. Practice, billing, the Stripe and Resend webhooks and the renewal-notice cron all fail together. There is no grace period.
- **Writes.** At 1 GB, writes that grow storage fail.
- **Shared allowance.** A burst of Preview deployments or a load test spends production's compute.
- **Recovery.** A bad migration or seed noticed more than 6 hours later cannot be undone by point-in-time restore. Until the move, the database recovery guide's restore point, a branch taken just before a bulk write, covers a planned change; it cannot cover an unplanned one.
- **DEBT-445.** Free stops creating branches at 10 per project, so per-Preview database branches cannot be turned on while the project stays on Free.

## Options

1. **Launch.** Usage-based with no monthly minimum: $0.106 per CU-hour and $0.35 per GB-month. It includes 10 branches, then $1.50 per extra branch-month. Neither compute nor storage is capped, history goes up to 7 days, and spend alerts fire at 80% and 100% of a threshold the owner sets.
2. **Scale.** $0.222 per CU-hour, with up to 30 days of history and support tickets. Launch covers what this product needs.
3. **Stay on Free and watch usage.** Suspension is project-wide and immediate. Watching only shortens the reaction, and the remedy is still the upgrade.
4. **Split production into its own Free project.** That would separate Preview's spending, but production would still suspend at 100 CU-hours and keep the 6-hour recovery window.

## Resolution (decided)

**Option 1, Launch.** The owner confirmed the finding on 2026-10-21 and scheduled the move for before the first live sale, beside Vercel Pro (DEBT-512). Until then the owner accepts the suspension risk; nothing before launch promises uptime.

The move is made in Vercel: Storage → `naltrexone-db` → Settings → Change Configuration. The plan applies to every database in the integration, and there is one. Afterwards the owner sets a Neon spend alert. Launch costs nothing at rest, so the owner may move earlier; the first live sale is the deadline.

## Verification

- [ ] Owner: Vercel's storage API or Storage page reads `naltrexone-db` on Launch.
- [ ] Owner: a Neon spend alert is set.
- [ ] Engineering: `/api/health` returns 200 after the change, and DEBT-445's Waiting row is re-read, since this move clears its first prerequisite.

## Related

- DEBT-512: Vercel Pro, due at the same time.
- DEBT-445: per-Preview database branches, which wait for this move.
- [Neon's Vercel-managed integration](https://neon.com/docs/guides/vercel-managed-integration): where its plan is changed.
