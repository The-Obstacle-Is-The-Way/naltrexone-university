# AUDIT-015: Bug and Debt Registers, Audited by Root Cause

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Project:** Naltrexone University
**Status:** Active — published by its pull request and closed on promotion; each decided item is tracked in the record it concerns
**Date:** 2026-10-08
**Baseline:** `origin/main` and `origin/dev` at the same tree, after promotion #1429
**Scope:** every Active record in the [bug](../bugs/index.md) and [debt](../debt/index.md) registers, and the Deferred rows DEBT-337, 349, 460 and 464: BUG-319–321, 323, 325, 327, 329–332; DEBT-414, 465, 500–506, 508, 510, 511.

## Why

On 2026-10-08 one day's work fixed six defects, and most came from a few shared causes. The owner asked for the registers to be audited before more fixing, so the work is ordered by cause, without over-engineering.

## Method

Three independent read-only reviews checked each record against the code at the baseline, against the other records and against GitHub. Each judged whether the record is still true, whether its plan is proportionate for a pre-revenue product, which cause it shares, and what should happen next. Claims that decide priority were checked again by hand, including Vercel's plan terms and the rate limiter's retention. No production or Preview database was read.

## Root causes

| Cause | Records it drives | Structural fix |
| --- | --- | --- |
| **One email, three copies.** Clerk, `users.email` and the Stripe customer each hold the user's email, and nothing keeps them in step. | DEBT-502 items 1–3, DEBT-511, DEBT-414 F07, DEBT-501 item 3 | One identity resolver: Clerk's verified primary email, provisioned under the tombstone lock (DEBT-502 item 2), moving a conflicting row, and syncing Stripe's copy. Provisioning, the billing refresh, the webhook and notice dispatch all use it. |
| **Concurrent provisioning without one lock.** | BUG-320, BUG-332 | DEBT-502 item 2: provisioning in one short transaction under the tombstone lock. The two retries stay as defence. |
| **Silent conditions, and an unwatched alert path.** | DEBT-505; DEBT-501 items 1–3; DEBT-503 items 2–4 | Alert kinds for the silent conditions, so their triggers announce themselves. A drill that proves the path end to end, and a watcher outside Sentry email that notices a missing drill or a stopped cron. |
| **Telemetry by subtraction.** Sentry sends what it collects unless each field is scrubbed. | BUG-318 (archived), BUG-331, DEBT-504 | Send only what diagnosis needs: no server breadcrumbs, no trace headers to other services, redaction on every span and envelope header (BUG-331), and server tracing only if it is used. |
| **Hosting plan.** Production runs on Vercel Hobby, which [Vercel's terms](https://vercel.com/legal/terms) limit to personal, non-commercial use. | New DEBT-512; it also explains DEBT-505's one-hour logs, DEBT-511's cron, which may start up to 59 minutes late and BUG-319's lack of Skew Protection | The owner moves production to Pro before the first live sale. |
| **Statuses lag releases.** Records shipped and promoted still read Open or blocked. | DEBT-506, DEBT-508, DEBT-510, BUG-330 | A promotion updates the records it ships. When a blocker ships, records that wait on it ("after DEBT-…") are updated in the same pull request. |
| **Facts restated in many places.** One decision is summarised in three to six records and index lines, and each copy drifts. | Most review findings on #1426 and #1428 | State a fact once and link to it. The index row repeats only the status line. |

## Dispositions

| Record | Verdict | Action |
| --- | --- | --- |
| BUG-319 | Fixed in code. Its remaining real-SDK test is engineering work, not a production check. | Keep Verifying for the Sentry check; the test joins the quick wins below. |
| BUG-320, BUG-332 | Fixed. Their Sentry checks are weak on a site with almost no traffic. | One combined Sentry query near 2026-10-22, recorded with counts, then archive. DEBT-502 item 2 removes the cause. |
| BUG-321 | Fixed in code; only Stripe's list response is unproven. | Re-scoped here to a provider-contract test of the adapter and sync. |
| BUG-323 | Fixed. Its impact line predates DEBT-503 item 1. | Corrected here. |
| BUG-325 | Fixed. | Sentry check near 2026-10-20, then archive. |
| BUG-327 | Fixed. #1404, which the record cited as open, was closed unmerged on 2026-10-07. | Corrected here. |
| BUG-329 | Real, but only for clone names of 40 or more characters; no current clone has one. | Priority P4, set here. |
| BUG-330 | Real. Its blocker, DEBT-503 item 1, was released on 2026-10-08. | Corrected here; fix next in its lane, testing token first. |
| BUG-331 | Real; the fix is in review (#1430). | — |
| DEBT-414 | Engineering mostly shipped. F21 and F22 remain, and the rest waits on the owner, counsel or a tax adviser. Several claims are stale. | Stale claims corrected here. Split later: F21 into DEBT-511, F22 into DEBT-501 item 4, the owner, counsel and tax items into one record. |
| DEBT-465 | Parts 1–3 done; Part 4's two runs belong to DEBT-501 item 7 and DEBT-483. | Close and archive. |
| DEBT-500 | True; Dependabot closed #1370 itself. | Add a Vitest group to Dependabot; park the migration with a trigger. |
| DEBT-501 | True. Items 5 and 6 and the reconcile's Stripe timeout are small; items 3 and 8 can wait for triggers. | Quick wins queued below. |
| DEBT-502 | True. Item 3 duplicates DEBT-511 item 4. | Kept in DEBT-502; DEBT-511 points to it. |
| DEBT-503 | Item 1 released. Its overlap check duplicates DEBT-508's. Item 2's design is heavy for now; item 3 is cheap. | Overlap check left to DEBT-508. Item 3 queued; item 2 waits for Clerk's reply or a cap trip. |
| DEBT-504 | True and proportionate. | Low priority. |
| DEBT-505 | Shipped; verified only in parts. | The drill and the watcher ship with this audit; the owner's inbox filter and the watcher's token complete it (below). |
| DEBT-506 | Status stale: the peer and sharp fixes shipped (#1411, promoted in #1419). `source-map-js` 1.2.2 and Clerk UI 1.38.0 are now eligible. Next.js alerts #84–#95, two of them high, stay open until 16.3.8 lands (Dependabot's #1425); DEBT-509, which assesses them, was in review at the baseline (#1420; promoted in #1431 the same day). | Corrected here. |
| DEBT-508 | Shipped (#1423, #1424); boxes 1–3 have tests; its blocker shipped. | Moved to Verifying here. |
| DEBT-510 | Shipped (#1423, #1424). | Moved to Verifying here. |
| DEBT-511 | True, and far off: the first scheduled notice is about eleven months after the first annual sale. | Decided as the identity resolver's first user (cause 1). Its portal-email item can ship early. |
| DEBT-337, DEBT-349 | Triggers not fired. | Stay deferred. |
| DEBT-460 | Part 3 is obsolete: `biome.json` reads its schema from `node_modules` since 2026-09-29. | Retired here, in its Deferred row and with a note in the record. |
| DEBT-464 | Trigger not fired; its own evidence shows the Hobby plan's terms. | The plan question moves to DEBT-512. |

## Decided order

The gates are re-keyed. "Before paid acquisition" was too late for some duties, which apply at the first live sale, and too early for others, which cannot apply until 35 days before the earliest live renewal.

1. **Now.** BUG-331 (#1430). Then the alert drill and the watcher (DEBT-505). Then BUG-330.
2. **Quick wins, one pull request.** Error text redacted before it reaches Sentry (DEBT-513, filed during review). `CONSENT_STATE_SECRET` required (DEBT-502 item 6). The circuit breaker counts only transient errors (DEBT-501 item 6). The payer's success-page message (DEBT-501 item 5). A Stripe timeout within the reconcile job's limit (DEBT-501 item 1). The price-ID runbook line (DEBT-501 item 2). The Dependabot Vitest group (DEBT-500). BUG-319's real-SDK test.
3. **Alert kinds for silent conditions.** A Clerk cap trip or 429 (DEBT-503 item 3), and a reconcile run that stops early and an unknown price ID (DEBT-501 items 1 and 2). Once a reconcile run that stops early alerts, the oldest-first reconcile (DEBT-501 item 1) waits for that alert.
4. **Before the first live sale.** Vercel Pro (DEBT-512, owner). The live purchase and refund (DEBT-501 item 7, owner). The tax decision (DEBT-414 Q7, owner). The legacy price-ID list (DEBT-501 item 2). The add-card completion recheck (DEBT-501 item 4 with DEBT-414 F22).
5. **Before paid acquisition.** Counsel's Q1–Q6 (DEBT-414).
6. **Before the earliest live renewal minus 35 days.** The identity resolver (DEBT-502 items 3, 1 and 2) and DEBT-511 on top of it, with DEBT-414 F21.

## Decisions

- **The drill keeps a durable once-per-cycle claim.** A stateless rule (drill on the 1st of each month) needs no table. But it delays the first end-to-end proof of the legal-deadline alerts to the next 1st, and it cannot retry a drill that Sentry refused. The claim lets the first drill go out right after release, and lets a failed drill retry the next day. It is one small table.
- **The watcher runs outside Sentry email.** A Sentry Crons monitor on the renewal job, plus a daily GitHub Actions check using a read-only Sentry token. The check opens a GitHub issue when the job, the alerts' workflow, the drill or the error quota fails a check; the checks are listed once, in [the runbook](../dev/logging.md#operational-alerts). The owner creates the token. Until then, the drill and the owner's inbox filter are the only checks.
- **Server tracing.** The owner decides whether to keep the 5% server trace sample. Without it the remaining span surface goes away, and the privacy policy's tracing sentence changes. BUG-331 records this once #1430 merges.

## Owner-only

- Move production to Vercel Pro before the first live sale (DEBT-512).
- Create the watcher's read-only Sentry token.
- Add the Gmail filter and the Sentry app's push for operational alerts (DEBT-505).
- The live purchase and refund, the tax decision, Clerk's "Verify at sign-up", the Resend webhook secret, and counsel's questions (DEBT-414, DEBT-501, DEBT-502).

## Related

- [AUDIT-014](../_archive/audits/audit-014-external-record-audit-2026-10-06.md): the previous audit of these records.
