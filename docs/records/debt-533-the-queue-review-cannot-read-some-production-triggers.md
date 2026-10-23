# DEBT-533: The Weekly Queue Review Cannot Read Some Production Triggers

**Status:** Blocked — the owner reads the sources below, or chooses a read path for the review; follow-up due 2026-10-30
**Priority:** P3
**Date:** 2026-10-23

---

## Summary

The weekly queue review evaluates each Waiting trigger from its named evidence. Three rows name production sources that the session assigned to the review cannot read. On 2026-10-23 the review could not check them, so the index's rule makes them this Blocked record with a dated follow-up.

- **SPEC-017's firewall row:** unexpected invocation or Neon growth, or actionable Vercel Firewall events.
- **DEBT-449:** two consecutive monthly production censuses of handled Clerk events, or impact Neon reports.
- **DEBT-450 part 3b:** 500 bookmarks in the monthly bookmark census. Its other source, Sentry latency after the fix, is readable.

## Evidence

- **Vercel.** On 2026-10-23 the CLI's `metrics` for `vercel.function_invocation.count` and `vercel.firewall_action.count` answered `payment_required`, because the queries need Observability Plus, a paid add-on. The attack-status API answered 404. The Firewall tab needs a signed-in browser, and the session's browser link was not connected.
- **A proxy, not the source.** Sentry's sampled `http.server` spans in production, extrapolated from the 5% sample, count 2,380 from 2026-09-25 to 2026-10-09 and 3,361 from 2026-10-09 to 2026-10-23, flat by day. Most of the rise is page-segment prefetches that Sentry now names `GET`. Nothing suggests unexpected growth, but this does not read the firewall or Neon.
- **Neon and the censuses.** Sessions do not connect to production's database, and they hold no Neon API key. The bookmark census has a written read-only procedure in the database guides, but it connects to production, which only the owner may do. DEBT-449's census of handled Clerk events has no written procedure.

## Impact

These triggers go unread each week. Each guards a cost, abuse or growth signal, so a week's delay breaks nothing, but a trigger nobody reads never fires.

## Options

1. **The owner reads the sources at each review** and records the outcome on the review's pull request. It costs nothing, but needs the owner every week.
2. **Give the review a read path,** such as a Neon key limited to metrics, Observability Plus, or the censuses as scheduled read-only jobs. Each costs access or money, which only the owner can grant.
3. **Rewrite the triggers** to evidence the review can read, such as Sentry's request spans for invocations, and keep the owner-only sources as a monthly owner check.

## Resolution (proposed)

No option is decided yet. The choice is the owner's, since each option needs the owner's time, access or money. Until then, each weekly review lists these triggers as not checked.

## Verification

- [ ] The owner reads the sources or chooses an option, recorded with the next queue review (due 2026-10-30).

## Related

- SPEC-017, DEBT-449 and DEBT-450: the rows whose triggers are unread.
