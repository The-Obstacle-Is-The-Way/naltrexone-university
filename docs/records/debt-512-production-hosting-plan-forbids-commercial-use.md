# DEBT-512: Production Runs on a Hosting Plan Whose Terms Forbid Commercial Use

**Status:** Blocked — the owner moves production to Vercel Pro at the first live sale (decided 2026-10-09); then engineering re-checks the Hobby workarounds
**Priority:** P2
**Date:** 2026-10-08

---

## Summary

Production runs on Vercel's Hobby plan, which [Vercel's terms](https://vercel.com/legal/terms) limit to personal or non-commercial use. Under Vercel's [fair-use definition](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage), any method of requesting or processing payment from visitors is commercial, so the live pricing page and checkout already count. The owner accepted that risk on 2026-08-11 until the first real users (DEBT-464). This record sets the deadline at the first live sale.

The plan's other limits (one-hour runtime logs, a daily cron that can start up to 59 minutes late, no Skew Protection) each have a workaround, listed under Resolution. Web Analytics is available on Hobby, but stays off under the owner's 2026-08-11 ruling and the commercial-use term (DEBT-464). Hobby allows three custom firewall rules, only one of them a rate limit. Since 2026-11-02 the one rule in use is the BUG-323 handshake rate limit, so a second rate-limit rule needs Pro (Edge Rules in `docs/architecture/security.md`).

## Evidence

- **The plan.** Vercel's API reported the team's billing plan as `hobby`, active, on 2026-10-08 and again on 2026-11-15.
- **The terms.** Vercel's [Terms of Service](https://vercel.com/legal/terms), section 4: "You shall only use the Services under a Hobby plan for your personal or non-commercial use." Its [fair-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) count requesting or processing payment, and advertising the sale of a product or service, as commercial.
- **Earlier ruling.** DEBT-464 recorded the same terms on 2026-08-10, and the owner's 2026-08-11 ruling accepted the Hobby risk until the first real users.
- **Cron timing.** [Vercel's cron docs](https://vercel.com/docs/cron-jobs/usage-and-pricing) give Hobby per-hour precision (±59 minutes), and Pro per-minute.

## Impact

- **Terms.** Taking payments on Hobby breaches Vercel's terms, which can lead to the project being limited or suspended.
- **Operations.** Moving to Pro relaxes the log, cron and firewall limits above, makes Skew Protection available, and lifts the commercial-use bar on Web Analytics. Each workaround stays until it is re-checked on Pro.

## Resolution (decided)

**Decided by the owner (2026-10-09):** keep the Hobby plan until the first live sale, then move production to Pro. The owner accepts the risk that Vercel's terms already apply to the live pricing page and checkout, which Vercel may enforce by limiting the deployment, as the 2026-08-11 ruling did. The other ways to comply, moving now or taking pricing and checkout offline, were offered and declined.

After the move, engineering re-checks each Hobby workaround and corrects its record or code comment:
- DEBT-505's runtime-log assumption, and two windows sized for Hobby: the renewal job's 90-minute Sentry monitor margin (`SEND_RENEWAL_NOTICES_MONITOR`, `src/adapters/jobs/send-due-renewal-notices.ts:51-59`) and the watcher's 25-hour staleness window (`CHECK_IN_STALE_MS`, `scripts/watchers/operational-alert-watcher.ts:32-33`);
- DEBT-511's cron timing, ADR-027's statements that the renewal cron's start window is 09:00–10:00 UTC (`:49`, `:89`), the supply-chain policy's once-a-day cron note (`docs/policies/supply-chain.md:171`) and the observability guide's one-hour log note (`docs/architecture/observability.md:54-55`);
- the BUG-319 Waiting row: the owner decides whether to turn on Skew Protection;
- the DEBT-464 Waiting row: re-plan Web Analytics and its privacy notice, as that row says;
- the firewall's custom-rule table in `docs/architecture/security.md`, for Pro's rule limits.

The owner revisits the security program's adoption exception (2), access and audit logs on Hobby, which the owner-adopted program reopens when the plan changes (`docs/policies/security/information-security-program.md:162`).

**Adopted 2026-10-17 (DEBT-524 step 8):** at that Pro recheck, remove a workaround only after equivalent failure-detection evidence or the owner's explicit acceptance of the remaining risk. Longer log retention alone does not detect a stopped schedule, a missing deployment, an expired read token or a Sentry failure. Preserve AUDIT-015's independent alert/schedule detection and each record's positive verification; a quiet log window is not proof of delivery.

## Verification

- [ ] Owner: the team's plan reads Pro.
- [ ] Owner: the security program's exception (2) is revisited.
- [ ] Engineering: each workaround above is re-checked against Pro's limits and corrected, and the BUG-319 and DEBT-464 rows are revived or kept with their decisions recorded. Any retired control has equivalent detection evidence or the owner's explicit risk acceptance, and positive-verification obligations stay covered.

## Related

- AUDIT-015: the audit that found it.
- DEBT-534: Neon Launch, due at the same time.

Corrected 2026-11-15: BUG-319 closed on 2026-10-23, so its Skew Protection decision is now a Waiting row. DEBT-464's Web Analytics row joins the Pro re-check. The re-check list names the monitor and watcher constants, ADR-027's cron note and the security program's audit-log exception. Since 2026-11-02 one custom firewall rule is in use, the handshake rate limit, which takes Hobby's one rate-limit slot. Web Analytics is available on Hobby; it is off by ruling, not by plan. The plan was re-read as `hobby` on 2026-11-15. The empty Resolved and receipt header lines are removed.
