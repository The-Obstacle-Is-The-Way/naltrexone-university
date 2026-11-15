# DEBT-533: The Weekly Queue Review Cannot Read Some Production Triggers

**Status:** Verifying — closes as Resolved in this pull request, once its three rewritten Waiting rows land; due 2026-11-22
**Priority:** P3
**Date:** 2026-10-23

---

## Summary

The weekly queue review evaluates each Waiting trigger from its named evidence. Three rows named production sources that the review session cannot read, so each week it listed them as not checked.

- **SPEC-017's firewall row:** unexpected invocation or Neon growth, or actionable Vercel Firewall events.
- **DEBT-449:** two consecutive monthly production censuses of handled Clerk events, or impact Neon reports.
- **DEBT-450 part 3b:** 500 bookmarks in the monthly bookmark census. Its other source, Sentry latency, is readable.

## Evidence

Read again on 2026-11-15:
- **Vercel.** Invocation counts need Observability Plus, a paid add-on that Hobby cannot buy: `vercel metrics vercel.function_invocation.count` answers `payment_required`. The attack-status API answers 404. Vercel CLI 65.14.0 reads the firewall, within limits:
  - `vercel firewall traffic list` gives requests by action and by rule for the last day only; `--since 36h`, `2d`, `3d` and `7d` answer "Observability Plus is required for this query". Its day held 1.2k denies by `sys_dos_mitigation`, Vercel's automatic DDoS mitigation, and no hit on the custom rule, `BUG-323 Clerk handshake nonce limit`.
  - `vercel firewall alerts list --since 30d` listed no alert despite those denies, so alerts alone are a weak signal.
- **Neon and the censuses.** Sessions do not connect to production's database and hold no Neon key, so only the owner can run a census. Nothing a session reads measures `clerk_events`: its rows come only from Clerk's `user.updated` and `user.deleted` deliveries (`src/adapters/controllers/clerk-webhook-controller.ts:220`), and Sentry's 5% trace sample held no Clerk webhook transaction in the 30 days to 2026-11-15. Those deliveries need no sale, so a gate on the first live sale does not bound the table.
- **Readable instead.** Sentry: DEBT-503 item 3's Clerk limit alerts show abuse that reaches the app, and BUG-377's watcher copies each into a GitHub issue. `action.getBookmarks` latency shows a slow bookmark page; no such span was sampled in 90 days.

## Impact

These triggers went unread each week. Each guards a cost, abuse or growth signal, so a week's delay breaks nothing, but a trigger nobody reads never fires.

## Options

1. **The owner reads the sources at each review.** Free, but it needs the owner every week.
2. **Give the review a read path,** such as a Neon key, Observability Plus, or the censuses as scheduled read-only jobs. Each costs access or money.
3. **Rewrite the triggers** to evidence the review can read.

## Resolution (decided)

Option 3, decided 2026-11-15 by the reviewing session, at the owner's delegation. Each row's "Revive when" becomes:
- **SPEC-017's firewall row:** hits on the BUG-323 rule in `vercel firewall traffic list --since 1d`, an alert in `vercel firewall alerts list --since 7d`, or a `clerk_site_limit_reached`, `clerk_signed_in_limit_reached` or `clerk_backend_calls_refused` issue in Sentry's server project. On Hobby the review sees only the last day; a week of traffic needs Observability Plus (DEBT-512). Invocation and Neon growth are dropped, since these signals show the abuse itself.
- **DEBT-449:** the owner's alone, as the row says, since no session can read the table: two monthly read-only censuses running (`SELECT count(*) FILTER (WHERE processed_at IS NOT NULL), pg_total_relation_size('clerk_events') FROM clerk_events`) show at least 1,000,000 processed rows, the ones a prune could delete, or 1 GiB; or Neon reports that table's impact. No sale gate.
- **DEBT-450 part 3b:** `action.getBookmarks` p95 at or above 300 ms in Sentry for seven days running, the threshold in `docs/guides/database/bookmark-census.md`. The census limb is dropped, since the latency limb measures the harm itself.

Done when the index's Waiting table carries the three rows; this record then closes as Resolved.

## Verification

- [x] Each rewritten row names a source a session can read with tools already configured, except DEBT-449's, which says it is the owner's. *Done 2026-11-15:* `vercel firewall traffic list --since 1d` and `vercel firewall alerts list --since 7d` answered, with no rule hit and no alert. Sentry's server project answered for the three Clerk kinds, with no issue, and for `action.getBookmarks`, with no span.
- [ ] The index's Waiting table carries the three rows, in this pull request; due 2026-11-22.

## Related

- SPEC-017, DEBT-449 and DEBT-450: the rows whose triggers are rewritten.
- BUG-331: dropping the server's 5% trace sample would leave the Sentry latency limbs nothing to read.
- DEBT-512: Vercel Pro makes Observability Plus purchasable, which a week of firewall traffic needs.

Corrected 2026-11-15: the evidence is reread: firewall traffic reads one day on Hobby, and alerts missed a day's DDoS denies; invocations and Neon are still unreadable. Option 3 is decided by the reviewing session at the owner's delegation, with rows a session can read: SPEC-017 on firewall traffic, firewall alerts and Sentry's Clerk alerts; DEBT-449 the owner's census of processed rows, without the sale gate; DEBT-450 part 3b on latency alone. No process sentence is added. The lapsed 2026-10-30 follow-up becomes this closing check, due 2026-11-22.
