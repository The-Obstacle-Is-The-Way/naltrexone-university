# DEBT-475 — local E2E readiness and interruption receipts

Date: 2026-09-20. This ledger covers only the E2E-infrastructure PR. DEBT-475 remains Open; the register and DEBT-473/474 are untouched.

## Replacement proofs before deletion

| Property | Red receipt | Replacement / green receipt |
| --- | --- | --- |
| Compose readiness has an explicit bound and E2E uses the same resolver-scoped command | `pnpm test --run scripts/run-local-test-db.test.ts scripts/e2e-local-orchestrator.test.ts`: 3 failed / 24 passed against the old arguments and wrapper target | `--wait --wait-timeout 60`, shared command delegation, unchanged resolver environment |
| A failed readiness command propagates without environment values in its error | Temporarily swallowing `runPlan` rejection made the new failure contract fail (1 failed, other cases filtered); mutation restored | Real Node child exits 1 through the surviving command runner; the failure is reported, the sentinel environment value is absent |
| Migration never starts after readiness failure | Temporarily swallowing `runCommand` rejection failed the stop-before-migration test; mutation restored | First-step rejection stops the serial plan |
| Both SIGINT and SIGTERM reach the active command | Export-only characterization of the old runner failed both handler checks; no synthetic provider or database call | Real child/descendant process fixtures, with an injected signal emitter to avoid signalling the test runner |
| A separately detached web server is terminated on interruption when OS signaling succeeds | A group-only implementation failed both signals: descendant remained alive | Snapshot active-command descendants before signalling, terminate their owned groups, retain two-second escalation after early parent exit |
| Cleanup cannot kill unrelated processes | The same process fixtures keep an unrelated live child alongside the owned tree | Unrelated child remains alive; both parent signal listeners are removed; fixtures clean up their own processes |

The detached-server case is not an evasion exercise: installed Playwright 1.63.0's `webServer` uses `launchProcess`, whose POSIX spawn is detached. The cleanup guarantee is for macOS/Linux; the pre-existing Windows direct-child fallback is not represented as equivalent tree cleanup. No general lifecycle framework or port-based process discovery was added.

## Real Compose receipts

Docker Compose v5.5.1 was exercised with two disposable, uniquely named projects, no published ports, and the existing `postgres:16` image running a harmless sleep command:

- Healthy healthcheck: `up -d --wait --wait-timeout 10 db` returned **0 in 1,829 ms**.
- Never-healthy healthcheck: `up -d --wait --wait-timeout 1 db` returned **1 in 1,250 ms**.
- Both fixture projects and their anonymous volumes were removed with project-scoped `down --volumes`. The clone database was neither reset nor removed.

These verify [Compose's documented readiness/timeout behavior](https://docs.docker.com/reference/cli/docker/compose/up/); the command contract pins the repository's 60-second budget. Only then were `local-test-db.ts` (213 lines), `ensure-local-test-db.ts` (40), and `local-test-db.test.ts` (322) deleted: **575 lines**. Their production caller consumed neither the former created/reused distinction nor Docker container IDs/health text. Resolver isolation, actual database-connectivity probes, migration ledger/schema checks and E2E credential checks remain.

Local red output is retained under `/private/tmp/codex-debt475-runtime.Xan40q/`: `docker-red.log`, `docker-failure-mutation-red.log`, `stop-before-migrate-red.log`, `signals-behavior-red.log`, and `detached-server-red.log`. Filtered targeted mutation runs are not full-suite coverage receipts.

## Merge evidence

Hosted CI `35520551535` exposed a real coverage gap on the first PR head: Codecov patch was 76.47%, with 16 missing lines in the process runner. Five additional boundary cases cover successful listener cleanup, missing executable, failed process discovery, and initial/escalated OS signal errors. All five fail under the corresponding swallowed-error / omitted-cleanup mutations (`runner-failures-mutation-red.log`) and pass against the restored implementation. No production behavior or coverage policy changed. Focused verification is now 4 files / 36 cases; the runner has 97.72% line coverage, with only the documented Windows direct-child fallback uncovered on POSIX. The unit-count delta is now 4,285 → 4,284 (11 duplicate cases removed, 10 boundary cases added), not an unchanged proof set.

Full local gate, hosted check-runs, exact-head review, and promotion evidence are to be recorded on the PR. No merge or production success is implied by the focused proofs above. No retry, trace, fixture-ownership, skip, ratchet floor, dependency or public-artifact policy changes are included.

Review correction (2026-09-20): CodeRabbit's root-group fallback finding was confirmed with two red cases (`root-group-fallback-red.log`): discovery failure left a same-group descendant alive, and a fallback cleanup error was not reported. The fallback now reuses the existing group-kill operation for the known root group; undiscoverable detached groups still require the documented orphan check. Both cases pass, bringing focused verification to 38 cases and the unit-count delta to 4,285 → 4,286. The Trivial request for an additional environment hook was rejected: the sole `vi.stubEnv` call is already enclosed by a `finally` that unstubs, restores the pre-test snapshot and restores spies, in that order, including on assertion failure. No duplicate hook was added.

Promotion-review qualification (2026-09-20, #940): the normal-interruption fixtures above do not establish cleanup after partial OS signal failure. A new [mixed-group fault-injection probe](./signal-error-review.md) confirms that the first non-`ESRCH` error skips later groups, and an initial-signal error also cancels escalation. Error-identity coverage is not group-cleanup coverage. This residual remains in DEBT-475; the OS fault was injected, not observed spontaneously.
