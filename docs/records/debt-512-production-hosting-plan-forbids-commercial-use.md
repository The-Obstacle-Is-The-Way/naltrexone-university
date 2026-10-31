# DEBT-512: Production Runs on a Hosting Plan Whose Terms Forbid Commercial Use

**Status:** Open — the owner keeps Hobby until the first live sale (decided 2026-10-09), then moves production to Vercel Pro
**Priority:** P2
**Date:** 2026-10-08
**Resolved:** —
**Verification receipts:** —

---

## Summary

Production runs on Vercel's Hobby plan, which [Vercel's terms](https://vercel.com/legal/terms) limit to personal or non-commercial use. Under Vercel's [fair-use definition](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage), any method of requesting or processing payment from visitors is commercial, so the live pricing page and checkout already count. The owner accepted that risk on 2026-08-11 until the first real users (DEBT-464). This record sets the deadline at the first live sale.

The plan also sets several limits the records work around:
- runtime logs kept for one hour (DEBT-505);
- cron runs that may fire up to about an hour late (DEBT-511's notice window);
- no Skew Protection (BUG-319);
- three custom firewall rules, one of them a rate limit, where Pro allows 40, any of them a rate limit ([Vercel WAF limits](https://vercel.com/docs/vercel-firewall/vercel-waf#limits)): on 2026-10-25 two containment rules were merged into one to make room for a third (Edge Rules in `docs/architecture/security.md`).

## Evidence

- **The plan.** Vercel's API reported the team's billing plan as `hobby`, active, on 2026-10-08.
- **The terms.** Vercel's [Terms of Service](https://vercel.com/legal/terms) restrict Hobby to personal or non-commercial use. Its [fair-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) count requesting or processing payment, and advertising the sale of a product or service, as commercial.
- **Earlier ruling.** DEBT-464 recorded the same terms on 2026-08-10, and the owner's 2026-08-11 ruling accepted the Hobby risk until the first real users. No live record tracked the plan.

## Impact

- **Terms.** Taking payments on Hobby breaches Vercel's terms, which can lead to the project being limited or suspended.
- **Operations.** Moving to Pro relaxes the log, cron and firewall-rule limits above and enables Skew Protection. Each record keeps its own mitigation until it is re-checked on Pro.

## Resolution

**Decided by the owner (2026-10-09):** keep the Hobby plan until the first live sale, then move production to Pro. The owner accepts the risk that Vercel's terms already apply to the live pricing page and checkout, which Vercel may enforce by limiting the deployment, as the 2026-08-11 ruling did. The other ways to comply, moving now or taking pricing and checkout offline, were offered and declined. Engineering then re-checks DEBT-505's log assumption and its watcher's timings (the cron monitor's 90-minute check-in margin and the watcher's 25-hour staleness window, both sized for Hobby's late starts), DEBT-511's cron timing and BUG-319's Skew Protection decision, and corrects each record.

**Adopted 2026-10-17 (DEBT-524 step 8):** at that Pro recheck, remove a workaround only after equivalent failure-detection evidence or the owner's explicit acceptance of the remaining risk. Longer log retention alone does not detect a stopped schedule, a missing deployment, an expired read token or a Sentry failure. Preserve AUDIT-015's independent alert/schedule detection and each record's positive verification; a quiet log window is not proof of delivery.

## Verification

- [ ] Owner: the team's plan reads Pro.
- [ ] Engineering: DEBT-505, DEBT-511 and BUG-319 are re-checked against Pro's limits and corrected. Any retired control has equivalent detection evidence or explicit owner risk acceptance, and positive-verification obligations remain covered.

## Related

- AUDIT-015: the audit that found it.
