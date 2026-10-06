# Bug Register

**Project:** Naltrexone University
**Last Updated:** 2026-10-06

**Now** — 2026-10-06.
- **Verifying.** BUG-319: its fix is in production since 2026-10-05; the checks are stable server-action IDs across two production builds and the Sentry signals in its record, due 2026-10-19. BUG-323: the request limits in production, due 2026-10-19. BUG-324: the production deploy passes the action-manifest check and practice, bookmarks and checkout work, due 2026-10-13.
- **Next.** BUG-320 to BUG-322. Remaining security findings are filed with their fixes.
- **Owner decisions pending.** None for bugs.

**Next Bug ID:** BUG-325

## Active

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| [BUG-319](./bug-319-subscribe-actions-break-after-a-deploy.md) | Subscribe and add-card fail for a page loaded before a deploy | P2 | Verifying — stable action IDs across two production builds and the Sentry checks; due 2026-10-19 |
| [BUG-323](./bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md) | Anonymous requests can spend Clerk's shared Backend API limit | P1 | Verifying — the limits reach production and answer 429 when exceeded; due 2026-10-19 |
| [BUG-324](./bug-324-server-actions-accept-caller-supplied-dependencies.md) | Exported server actions accept caller-supplied dependencies | P1 | Verifying — the production deploy passes the action-manifest check and practice, bookmarks and checkout work; due 2026-10-13 |
| [BUG-320](./bug-320-first-pricing-render-user-upsert-race.md) | A new user's first visit can fail when two requests create their row at once | P2 | Open — decided: retry the upsert once when the email's owner is the same Clerk user |
| [BUG-321](./bug-321-already-subscribed-answer-discarded.md) | Stripe's "already subscribed" answer is discarded for signed-in users | P2 | Open — decided: sync the customer's subscriptions; else a notice and portal link |
| [BUG-322](./bug-322-checkout-error-hidden-behind-dialog.md) | A checkout error is hidden behind the consent dialog that reopens | P2 | Open — decided: show the error inside the dialog |

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
