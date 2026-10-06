# AUDIT-013 — Security Review of Recent Work

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Project:** Naltrexone University
**Date:** 2026-10-05 (review); filed 2026-10-06
**Scope:** What an anonymous or low-privilege user can make the server log, report to Sentry, or spend. Authorization, input validation, redirects, webhook authenticity, payment integrity and answer-key secrecy across everything merged to `dev` since 2026-09-26. Secrets, CI artifacts, HTTP headers and caching, dependencies, and personal data sent to third parties.
**Status:** Active — findings are filed; production checks remain in BUG-323–325 and BUG-327, and renewal-evidence work in DEBT-414

---

## Why

The owner asked for a security review of recent work. They had lost track of a lead: "a user with certain parameters could obtain or spam logs".

## Method

- **Three independent read-only reviewers,** each on one surface of the scope above. Each checked the existing records first, and cited them instead of refiling.
- **The filer re-verified every finding** in code before filing. Claims that rest on a reviewer's trace alone are marked as such in their records.
- **Measurements.** The ones that loaded a vendor were made against development instances only. Production was touched only to check the BUG-323 firewall rule and with single read requests. No secret value was printed.

## Findings

| Record | Family | Priority | Finding | State on 2026-10-06 |
|--------|--------|----------|---------|---------------------|
| [BUG-323](../bugs/bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md) | Availability, Clerk | P1 | Some anonymous request shapes make Clerk's SDK spend the Backend API allowance every signed-in page shares | Firewall rule and middleware limits in production; Verifying |
| [BUG-324](../bugs/bug-324-server-actions-accept-caller-supplied-dependencies.md) | Server actions | P1 | Exported server actions accepted caller-supplied dependencies, so one request could run many actions | Fixed in production; Verifying |
| [BUG-325](../bugs/bug-325-malformed-requests-throw-and-write-oversized-logs.md) | Input handling, logging | P3 | Malformed requests made our code throw, or write the caller's text at error level. This is the owner's lead | Fixed in production; Verifying |
| [BUG-326](../_archive/bugs/bug-326-error-pages-send-people-to-public-issue-tracker.md) | Privacy, support | P3 | Error pages sent people, payers included, to the public GitHub issue tracker | Resolved; in production |
| [BUG-327](../bugs/bug-327-dependabot-branches-build-with-preview-secrets.md) | Supply chain | P3 | Vercel built Dependabot branches with Preview secrets, against the owner's 2026-09-19 boundary | Fixed in production; Verifying |
| [BUG-328](../_archive/bugs/bug-328-playwright-reports-embed-clerk-dev-tokens.md) | CI artifacts | P3 | Every public Playwright report carried Clerk development-instance tokens | Resolved; promoted through #1406; green main run has zero artifacts |
| [DEBT-414](../debt/debt-414-public-legal-pages-privacy-terms.md#findings-from-audit-013-2026-10-05) F21 | Renewal evidence | P4 | An early bounce report can be lost | Decided; not yet built |
| [DEBT-414](../debt/debt-414-public-legal-pages-privacy-terms.md#findings-from-audit-013-2026-10-05) F22 | Renewal evidence | P4 | A trial cancelled in the portal is still offered "Add a card" | Decided; not yet built |

## Accepted, not filed

- **During an active exam, a learner can see a question's answer key on its standalone page** (P4). A standalone submit is checked against the question, not against the learner's open sessions. Only the learner's own self-assessment is affected: no score is shared, certified or relied on by anyone else. Revisit if scores ever leave the learner's own view.
- **The cron routes write one warn line per unauthenticated request.** The lines are bounded and contain only fixed text.
- **CSP violation reports reach Sentry.** Already recorded in DEBT-420 (archived).
- **The Sentry quota.** Accepted as Sentry advises: the client key is public by design. See BUG-325 item 5.
- **Production and Preview sharing one server-action key.** Refuted: each has its own value (BUG-319).

## Surfaces reported sound in the original review

These are the original reviewers' conclusions, not independently reproduced guarantees. Their full traces are not attached to this record. The external audit of 2026-10-06 verified individual paths and release receipts but cannot certify universal claims such as ‘every’, ‘no’ or ‘never’ from those reports. Any new reliance requires a named source path and proving test; the open records above retain their checks.
- **Authorization.** Every learner action resolves the caller before any read. Attempt, session, bookmark and idempotency queries filter on the caller.
- **Answer keys and withdrawn content.** In an exam session, answer keys stay hidden until the session ends; the standalone-page exception above is accepted. Grading requires a choice from the bound revision. Withdrawn content is shown only to a learner who answered it.
- **SQL.** There is no raw SQL built from input. Filters are enums and pagination is capped.
- **Redirects.** Stripe, portal and add-card URLs, and acknowledgment links, are built from the configured app URL, never the Host header.
- **Webhooks and cron.** Stripe, Clerk and Resend verify signatures over the raw body. Cron routes compare digests in constant time. In production the client address comes only from Vercel's header.
- **Payment integrity.** Prices and trial eligibility are decided on the server. The success page requires the subscription's server-set user to match the signed-in user.
- **Caching.** No cache key can serve one user's data to another.
- **Headers.** HSTS, nosniff, Referrer-Policy, frame denial and Permissions-Policy are set. The CSP is report-only by the accepted DEBT-420 decision.
- **Workflows.** There is no `pull_request_target`, permissions are least-privilege, actions are SHA-pinned, and secrets are scoped to their steps.
- **Sentry.** Cookies, user data, bodies and local variables are off, and credential headers and query values are filtered (BUG-318).
- **Dependencies.** No critical advisory. The open ones are recorded with their reasons in DEBT-495 and DEBT-476.
