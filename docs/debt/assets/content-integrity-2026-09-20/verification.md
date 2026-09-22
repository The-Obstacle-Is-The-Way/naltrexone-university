# Content-integrity safeguards — 2026-09-20

This ledger separates parser/import guards, database mutation guards and release
management. The implementation-wave reproductions used synthetic content and
real CLI or Postgres boundaries. This reconciliation adds no runtime or test code. Local database tests used the clone-isolated Docker target;
provider-backed E2E used Clerk and Stripe TEST mode. No production content import,
seed, withdrawal or clinical-data inspection was performed.

## Reconciliation snapshot

**CONFIRMED:** at this reconciliation, `origin/main` is `7e41deaa` and
`origin/dev` is `65bd70c0`. Git ancestry places #943/#945 in main and the
subsequent five source merges in dev only. The completed #946 production
receipt below closes DEBT-482/487. DEBT-486 remains Active for its subsequent
release readback; DEBT-483/484 remain Active for their implementation tails.
This snapshot does not claim that a later promotion has completed.

## Reviewed merges

**CONFIRMED:** every row below received CodeRabbit `APPROVED` on the listed exact head, had zero
unresolved threads, passed hosted CI, and merged with a merge commit. The linked
PR discussions retain warning/finding adjudication; a green check alone was not used
as review approval.

| Mechanism | Red proof | Focused green | Exact approved head / review | Dev merge | Hosted CI |
|---|---|---|---|---|---|
| [#943](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/943): full draft-block consumption (DEBT-487) | 14 failed / 11 passed on the old splitter; supported preamble compatibility then failed 1 / passed 13 | 60/60; 948 complete parsed representations unchanged in a read-only local corpus comparison | `df8a4baf` / `5261420106` | `95c8f93e` | [35530510447](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35530510447) |
| [#945](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/945): global duplicate QIDs (DEBT-482) | 10 failed / 12 passed; same-file, cross-file, cross-source and cross-family duplicates | 70/70; read-only import reports 948 unique QIDs | `efc1d3d3` / `5261470841` | `3cad67d4` | [35531729042](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35531729042) |
| [#949](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/949): shared import/seed body validation (DEBT-486) | 19 failed / 50 passed on the previous body boundary | 117/117 plus 10 Postgres history cases; all 948 local authored questions cited, ten explicitly synthetic placeholders exempted | `852c26d5` / `5261681489` | `b2efba9c` | [35535698571](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35535698571) |
| [#951](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/951): graded-history rewrite guard (DEBT-484) | 18 failed / 12 passed before implementation | 30/30 Postgres cases, including a real row-lock race | `d8bf8adc` / `5261726459` | `269ffeec` | [35536461282](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35536461282) |
| [#952](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/952): static whole-input seed prevalidation (DEBT-483) | 16 failed / 1 passed; later invalid input, duplicate slug and conflicting tag definitions previously followed earlier commits | 47/47 Postgres cases | `936de53e` / `5261750605` | `31d3a718` | [35537614430](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35537614430) |
| [#953](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/953): explicit withdrawal and stale-seed refusal (DEBT-483) | 14 failed / 1 passed: four stale resurrection defects and ten cases requiring the new command; stale pre-lock status mutation failed 1 / skipped 15 | 66/66 Postgres cases after preserving the narrow synthetic placeholder lifecycle | `0aeda526` / `5261806134` | `8da15de2` | [35538749320](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35538749320) |
| [#954](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/954): clean write staging (DEBT-483) | Three normal-write refusals fail without the guard; three dry-run compatibility cases failed against the initial overbroad guard | 86/86; write-guard removal again fails 3 / passes 28 | `844cc5cb` / `5261882451` | `65bd70c0` | [35540192530](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35540192530) |

The source PRs ran full local gates before each push. Final hosted gates for these heads
included 411 browser tests and 44 E2E tests without retries. Unit/integration
counts increased as cases were added; consult each debt's dated receipt for its
exact counts. A failed DEBT-486 local E2E attempt (43 pass / 1 fail) remains a
failed attempt: matching server/browser digest 1426188838 established a Clerk
503. No product retry or timeout policy was changed to obtain green.

The [captured GitHub API/ancestry receipt](source-pr-receipts.json) records each
merged head, matching formal approval and zero unresolved threads. It was
re-derived using `gh pr view --json headRefOid,mergeCommit,mergedAt`, the REST
`pulls/{number}/reviews` response and GraphQL `reviewThreads`;
`git merge-base --is-ancestor <merge> origin/main` supplies the release-ancestry
column. These are read-only checks.

## Verified production milestone

[Promotion #946](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/946)
merged `7e41deaab3bcad02afcc74497ce7ad0ef8dc13ab` at 19:45:29 UTC.
It includes #943 and #945. Exact-main [CI 35533344339](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35533344339)
completed successfully at 19:55:58 UTC. Vercel deployment
`dpl_925mzvYCptMGbAHcxq9mxqdvUPz8` remained READY/STAGED with no alias at
19:55:53 UTC, then received the production alias at 19:56:00.003 UTC.
The 19:57:02 UTC alias readback matched that exact main SHA; GET `/` and
`/api/health` both returned 200.

Immediately after merge, both branch trees were
`970fffaa632062d124963281be5796b2c3bf377a`, with zero dev-only commits.
The later #944 merge advanced dev while main CI was running; that later tree
difference was reported explicitly. See the [production closeout](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/946#issuecomment-5752293936).

## Remaining boundaries and execution order

- Withdrawal retains database history, but current published-only retrieval does
  not make archived questions available through previous-attempt review.
- Graded-history refusal does not implement immutable question revisions or bind
  every active ungraded session to a historical representation.
- Static prevalidation does not make a whole corpus transaction: database-dependent
  failures can still follow earlier per-question commits.
- Clean staging does not activate, sign, freshness-check or roll back a release.
  The managed caller's delete-before-regenerate window remains a separate task.
- Missing drafts do not imply withdrawal. Explicit QIDs are required; stale
  authored seed files cannot reactivate archived rows through the seed path.

1. Record the later release readback for [DEBT-486](../../../_archive/debt/debt-486-import-seed-validation-disagreement.md) when it exists; its shared parser implementation and review are complete. Promotion execution belongs to the other clone.
2. Adapt the existing managed caller to the safe staging boundary under [DEBT-483](../../debt-483-content-withdrawal-and-release-rollback.md#clean-import-staging-safeguard--2026-09-20). This is actionable without private SPEC-007, but `scripts/seed-environment-runtime.ts:108-123` is outside this clone's assigned files. Do not claim that fresh manual staging fixes that caller.
3. Agree the private SPEC-007 revision/release interface before implementing immutable revision binding, atomic activation or revocation-aware rollback. [DEBT-484](../../debt-484-question-rewrite-history-identity.md#deliberate-boundaries) preserves the published-only review and active-session limitations. A manifest or row-preservation assertion is insufficient to close either record.

These dependencies do not block use of the already-merged narrow safeguards.
This ledger does not invent an alternative release or revision contract.
