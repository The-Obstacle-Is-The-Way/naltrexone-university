# DEBT-512: Production Runs on a Hosting Plan Whose Terms Forbid Commercial Use

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — owner moves production to Vercel Pro no later than the first live sale; moving now is recommended
**Priority:** P2
**Date:** 2026-10-08
**Resolved:** —
**Verification receipts:** —

---

## Summary

Production runs on Vercel's Hobby plan, which [Vercel's terms](https://vercel.com/legal/terms) limit to personal or non-commercial use. Under Vercel's [fair-use definition](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage), any method of requesting or processing payment from visitors is commercial, so the live pricing page and checkout already count. The owner accepted that risk on 2026-08-11 until the first real users ([DEBT-464](../_archive/debt/debt-464-web-analytics-activation.md)). This record sets the deadline at the first live sale.

The plan also sets several limits the records work around:
- runtime logs kept for one hour (DEBT-505);
- cron runs that may fire up to about an hour late (DEBT-511's notice window);
- no Skew Protection (BUG-319).

## Evidence

- **The plan.** Vercel's API reported the team's billing plan as `hobby`, active, on 2026-10-08.
- **The terms.** Vercel's [Terms of Service](https://vercel.com/legal/terms) restrict Hobby to personal or non-commercial use. Its [fair-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) count requesting or processing payment, and advertising the sale of a product or service, as commercial.
- **Earlier ruling.** [DEBT-464](../_archive/debt/debt-464-web-analytics-activation.md) recorded the same terms on 2026-08-10, and the owner's 2026-08-11 ruling accepted the Hobby risk until the first real users. No live record tracked the plan.

## Impact

- **Terms.** Taking payments on Hobby breaches Vercel's terms, which can lead to the project being limited or suspended.
- **Operations.** Moving to Pro relaxes the log, cron and Skew Protection limits above. Each record keeps its own mitigation until it is re-checked on Pro.

## Resolution

**Decided:** the owner's 2026-08-11 ruling accepts the Hobby plan's risk until the first real users, so production moves to Pro no later than the first live sale. **Recommended (2026-10-08 review):** move now. The live pricing page and checkout are already commercial use under Vercel's definition. The other way to comply is to take pricing and checkout offline until the move. The owner decides. Engineering then re-checks DEBT-505's log assumption and its watcher's timings (the cron monitor's 90-minute check-in margin and the watcher's 25-hour staleness window, both sized for Hobby's late starts), DEBT-511's cron timing and BUG-319's Skew Protection decision, and corrects each record.

## Verification

- [ ] Owner: the team's plan reads Pro.
- [ ] Engineering: DEBT-505, DEBT-511 and BUG-319 are re-checked against Pro's limits and corrected.

## Related

- [AUDIT-015](../audits/audit-015-register-audit-by-root-cause-2026-10-08.md): the audit that found it.
