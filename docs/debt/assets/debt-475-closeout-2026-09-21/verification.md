# DEBT-475 closeout — 2026-09-21

Verified against main `66ee3da2` and dev `35bb9d68`, identical tree `d2488a1e289de455988bf64bb990717f1c911a3e`. This record closes the toolchain disposition program, not the independent DEBT-473/474 operational receipts or DEBT-476 dependency follow-up.

## Final implementation receipts

| Mechanism | Source / promotion | Evidence |
| --- | --- | --- |
| Helper recovery | #960 / #961 | Three red cases; 35 focused green; source `68e50ded`, dev merge `bdc33336`, main `066f3e1b`; main CI `35552349472` green. [Production hold and health](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/961#issuecomment-5754464946). |
| Raw JSX button lint | #962 / #963 | Red real-lint and exemption-count fixtures; final 35 focused green, including the missing-source coverage case; source `1217ab3b`, dev merge `c7e87784`, main `40d7c604`; main CI `35556050565` green. [Production hold and health](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/963#issuecomment-5754884564). |
| Architecture lint | #964 / #965 | Initial real-lint 23 failures, four literal-call fallback failures, independent semantic mutation failures; 68 focused architecture/Sentry cases, 81 including the button harness. Source `ac2bdf42`, dev merge `35bb9d68`, main `66ee3da2`; main CI `35559030529` green. [Production hold and health](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/965#issuecomment-5755234022). |
| Docker readiness | #939 | Source `8d688817`, merge `8c0dbb57`, ancestor of current main (exit 0). Compose's healthy/timeout probes preceded the 575-line deletion; [original red ledger](../debt-475-e2e-infrastructure-2026-09-20/verification.md). |
| Partial signal-error cleanup | #942 | Source `521e4f73`, merge `914dc0e4`, ancestor of main (exit 0). Three failures on old runner; loop-only fix still failed twice; first-error-precedence mutation failed once. Restored 36 focused cases. The current runner attempts every group and retains escalation; permanently unsignalable groups are not promised to terminate. [Reviewed PR receipts](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/942). |
| Reviewed Vercel CLI | #948 / #959 | Source `6bd296b2`, merge `e4e53598`, ancestor of main (exit 0). Exact preinstalled version check retains production target fencing without adding the CLI to the lockfile. [Red proof and accepted tooling risk](../vercel-cli-pin-2026-09-20/verification.md). Operator provisioning remains a documented prerequisite, not a claimed successful live env pull. |
| security.txt renewal | #944 / #959 | Source `0d30b4bb`, merge `eedc68a6`, ancestor of main (exit 0). Monthly/manual workflow with SHA pins and job-scoped issue permission. Manual main run `35552383175`, head `066f3e1b`, succeeded 01:54:08–01:54:13 UTC and logged `security.txt renewal: not-due` at 01:54:12.2903385; renewal-issue count zero. Creation/update/reopen behavior is covered by unit contracts; this is not a claim that a not-yet-due issue was created. |

Earlier completed dispositions retain their original dated red receipts and KEEP rulings in the archived table. #959's historical promotion used the owner's explicitly authorized one-time formal-review-record waiver; it is not represented as a new exact-head formal approval or as precedent. The new #960–#965 source/promotions each had formal exact-head approval, zero unresolved threads, green checks, and merge commits without overrides.

## Latest release proof

- #964 formal approval on `ac2bdf42`: 03:38:50 UTC. #965 formal approval on `35bb9d68`: 03:46:50 UTC. Both had zero unresolved threads and all five checks/statuses green.
- Main CI `35559030529`: test succeeded at **04:04:01 UTC**. Unit **470 files / 4,495**, browser **65 / 411**, integration **46 passing files / 349**, plus **two opt-in suites / six intentional skips**, required E2E **44/44 in 3.3 minutes**, no failures or retries.
- Vercel build Ready **03:54:31.126 UTC**; observed **READY/STAGED at 03:54:43.006** with the test check running, no alias assignment, and old main `40d7c604` serving.
- Vercel test succeeded **04:04:03.281 UTC**; production alias assigned **04:04:03.447**, afterwards. Final deployment **READY/PROMOTED**, serving `66ee3da2`.
- Production `/` and `/api/health`: **200**; health `ok=true`, `db=true`. No provider identifiers or secret values were emitted.

## Closure decisions and corrections

- #966 review correction: the live retry-policy guide still described helper recovery as unresolved after #960. The sentence now matches the success-path helpers' immediate errors and the separate explicit error-state detector; no implementation or retry policy changed.
- The optional shared reader is **not extracted**. The condition was demonstrated net deletion, not mandatory consolidation. Short architecture/theme read mappings return different shapes; the skip reader additionally owns named failure behavior. No general walker, resolver, or lifecycle framework is created to close a checkbox.
- The retained seed-choice guard is `scripts/seed-helpers.ts:29–72`, called by `scripts/seed/question-syncer.ts:396–410`: it protects historical choice references from deletion. The previous path and explanation-reference description were wrong; no content-import code is changed.
- Ordinary syntax moved to Biome; resolved targets, type-only distinctions, hook placement, page-model naming, documented literal-loader gaps, mobile-nav cardinality and opacity policy remain guarded. A computed-loader expansion proposed on #964 was rejected with receipts: pre-existing limitation, zero occurrences across 401 production files, outside the approved row. CodeRabbit withdrew it and formally approved the unchanged head.
- The canonical debt record is archived; its historical paragraphs remain, with a dated closeout superseding stale pending statements. Evidence assets stay at their existing locations. A short old-path pointer preserves links from owner-protected DEBT-479/480; neither record is edited. The Active table moves from 15 to **14**, with one Latest stanza and Next Debt ID **488** unchanged.
- DEBT-473 and DEBT-474 remain Open until their own Sep 21 hosted/scheduled receipts exist. DEBT-476 remains Open until the permitted Sep 22 fast-uri upgrade is actually shipped. No early closure or manufactured cron invocation.

## Archive integrity

The same read-only relative-Markdown destination check was run against the base Git tree and this working tree across `docs/` and `AGENTS.md`: **630 pre-existing broken occurrences / 316 missing destinations**, unchanged after the move; **zero new missing destinations**. This measures file/directory destinations, not heading anchors, and does not rewrite historical broken links. A focused check of the archive, redirect, closeout ledger, and protected 479/480 references found **64 relative links / zero missing targets**. The register has **14 Active rows, one Latest stanza, Next Debt ID 488**. Only the 475 record/redirect, its receipt asset, the shared index, and the live-guide retry-policy paragraph change.
