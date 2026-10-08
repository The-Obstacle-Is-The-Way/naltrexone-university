# Bug Register

**Project:** Naltrexone University
**Last Updated:** 2026-10-07

**Now** — 2026-10-07.
- **Verifying.** BUG-319: its fix is in production since 2026-10-05; the Sentry checks and a real-SDK test that the stale-action event reaches Sentry, due 2026-10-19. BUG-323: the owner confirms the production limiter writes its rows, due 2026-10-19. BUG-320: no `User could not be upserted` error in Sentry for two weeks after the deploy, due 2026-10-20. BUG-325: no Sentry event from the fixed paths for two weeks, due 2026-10-20. BUG-327: #1404 has no deployment; merge through the tooling remains, due 2026-10-20.
- **Next.** Fix BUG-329; write BUG-321's test-mode E2E; fix BUG-330 after DEBT-503 item 1; archive each Verifying record when its check passes.
- **Owner decisions pending.** BUG-319: whether to adopt Skew Protection, which needs Vercel's Pro plan.

**Next Bug ID:** BUG-331

## Active

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| [BUG-329](./bug-329-local-test-target-changes-in-child-commands.md) | Long clone names change the local test target in child commands | P3 | Open — canonicalize generated instance names before passing them to child commands |
| [BUG-330](./bug-330-stored-clerk-session-lost-after-token-expiry.md) | Signed-in E2E fails en masse when the stored Clerk session cannot be restored after its token expires | P3 | Open — resolution decided below; fix after DEBT-503 item 1 |
| [BUG-319](./bug-319-subscribe-actions-break-after-a-deploy.md) | Subscribe and add-card fail for a page loaded before a deploy | P2 | Verifying — the Sentry checks, and a real-SDK test that the stale-action event reaches Sentry; due 2026-10-19 |
| [BUG-323](./bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md) | Anonymous requests can spend Clerk's shared Backend API limit | P1 | Verifying — owner confirms the production limiter writes its rows; due 2026-10-19 |
| [BUG-320](./bug-320-first-pricing-render-user-upsert-race.md) | A new user's first visit can fail when two requests create their row at once | P2 | Verifying — no `User could not be upserted` error in Sentry for two weeks after the deploy; due 2026-10-20 |
| [BUG-321](./bug-321-already-subscribed-answer-discarded.md) | Stripe's "already subscribed" answer is discarded for signed-in users | P2 | In Progress — the fix is in production; a Stripe test-mode E2E of the refused checkout remains |
| [BUG-325](./bug-325-malformed-requests-throw-and-write-oversized-logs.md) | Malformed anonymous requests make our code throw and write oversized error logs | P3 | Verifying — no Sentry event from the fixed paths for two weeks after the deploy; due 2026-10-20 |
| [BUG-327](./bug-327-dependabot-branches-build-with-preview-secrets.md) | Dependabot branches are built on Vercel with Preview secrets | P3 | Verifying — no deployment observed for #1404; a Dependabot merge through the tooling remains; due 2026-10-20 |

## Parked (accepted risk)

**Terminal-close disposition rule** (for the findings of a fix wave's terminal audit; introduced by #673, 2026-07-18): confirmed P3-or-higher findings enter Active as must-fix; confirmed P4 findings enter Parked (accepted-risk) and do not extend a mandatory fix wave. It does not govern a risk accepted through other triage, such as a dependency advisory with no fix (DEBT-476, DEBT-495).

| ID | Title | Priority | Accepted risk |
|----|-------|----------|---------------|
| — | None | — | — |

## Deferred (not resolved)

Unfinished tails of closed bugs, each with a revive trigger. None.

| ID | Title | Priority | Deferred | Revive when |
|----|-------|----------|----------|-------------|
| — | None | — | — | — |

## How this register works

- **Open work only.** This index lists every open record: Active, Verifying, Parked and Deferred. A record is one file in this folder, with its evidence, options, decision and verification checklist. Closed records live in [`../_archive/bugs/`](../_archive/bugs/), named by ID.
- **Verifying.** A record whose fix has merged, but whose last check can only happen after promotion or in production, stays here. Its status reads `Verifying — <the check>; due YYYY-MM-DD`. It is archived, in the next pull request that touches this register, once that check is recorded. A weekly job opens a GitHub issue for any check past its due date.
- **History is in git.** This index states the current position; pull requests and commits carry what changed and its receipts. The register's tables, audits and update notes up to 2026-10-05 are frozen in [`register-frozen-2026-10-05.md`](../_archive/bugs/register-frozen-2026-10-05.md) and the `register-history-*.md` files beside it.
- **Procedure.** [Closing and Archiving Documentation Records](../../AGENTS.md#closing-and-archiving-documentation-records).
