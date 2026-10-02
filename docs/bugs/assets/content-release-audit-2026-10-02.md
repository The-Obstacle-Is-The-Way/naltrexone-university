# Content release audit — 2026-10-02 UTC

Audit baseline: `dev` at `312e4415`; PR #1301 initially at `6a9c5f2f`.
Work and database access were confined to the `naltrexone-university-3` clone
and its resolver-owned local Postgres. No Preview/production database was read
or changed. Applied migrations 0045–0048 were not edited; their files match
`origin/main` at the audit's fetch.

## Confirmed findings and decisions

| Concern | Verdict and evidence | Action |
|---|---|---|
| Partial bundle removes live content | CONFIRMED, P1: 50 live; stage 10; activation archives 40; rollback restores 40. Disposable helper, real seed/builder/activation. | [DEBT-489](../../debt/debt-489-release-removes-omitted-questions.md), design review in #1301. Implementation belongs to the parallel session. |
| Operator lock ordering and concurrent staging | CONFIRMED, P2: hold/withdrawal cycle produces `40P01`; identical new-only stages produce one success and one `23505`. | [BUG-314](../bug-314-content-hold-withdrawal-deadlock.md); serialize supported operator transactions on the pointer. |
| Learner/content writer locks | CONFIRMED, P2: attempt foreign-key batch versus activation and real session creation versus a hold both produce `40P01`. Reversed physical row order proves session binding takes unordered locks. | BUG-314; NO KEY UPDATE writer locks, sorted session SHARE locks, no early hold subset lock. |
| Placeholder prefix as fixture identity | CONFIRMED, P2: one authored prefix-matching question archived, no withdrawal recorded. | [BUG-315](../bug-315-placeholder-prefix-archives-authored-content.md); exact committed fixture slugs, fixture-list contract. |
| Test resource ownership | CONFIRMED, P3: migration setup failure leaks one database; visibility-test cleanup waits on its own blocked activation. All probe-created databases were cleaned. | [BUG-316](../bug-316-content-release-test-resource-cleanup.md); setup cleanup and release/settle before DDL cleanup; wait identifies backend and key. |
| Staging is private except for tags | REFUTED: an abandoned stage's authored archive is a permanent withdrawal; re-applying the original release archived one question. | DEBT-489 assessment and [BUG-317](../bug-317-content-release-documentation-overclaims.md). No change to withdrawal policy here. |
| Held/dropped means withdrawn in the UI | VERIFIED in source: `get-question-for-view`, `get-attempted-questions`, and `get-user-stats` use `status !== 'published'`. Clinical suitability is UNVERIFIED. | BUG-317 corrects the claim that holds imply no grading; finalization still grades saved drafts against bound revisions. Owner scoring decision remains deferred. |
| Latest #1301 eligibility wording finding | REFUTED: the omission implication is true; adjacent hold guidance and storage prose already explain eligibility. | CodeRabbit accepted the source-backed adjudication, withdrew the finding and resolved its thread. Formal exact-head approval and green CI preceded merge `243fec2b`. |

## Verification matrix

The full baseline integration gate passed **629 tests, 12 skipped**. Focused
release builder/commands/verification rerun: **28 passed**. The new focused
regressions after fixes: **15 passed**. These are local receipts, not a claim
of deployment or of executing the skipped tests.

| Contract | Evidence and limit |
|---|---|
| Stale caller, stale parent, rollback receipt exemption | Source and `content-release-activation.integration.test.ts`: caller expectation always checked; parent mismatch allowed only with an earlier activation receipt. |
| Manifest and item verification | Activation rebuilds the manifest from item slugs and revision hashes and compares hashes. It trusts immutable revision hashes; it does not re-hash every stored content field at activation. |
| Canonical JSON | Independent Python comparison matched both the committed digest vector (`cb253d7e06537d59c6f200de3db0c9b91c6962e80fac8c7f1d71deb0e88ab2a0`) and Unicode/control-character JSON. Authored slugs are ASCII-validated; the JavaScript comparison is not a general Unicode code-point sorter. |
| Withdrawals and holds | Real-Postgres activation/commands/verification suites cover per-question withdrawal, revision hold, lift, and rollback exclusions. |
| Drafts and bootstrap | Existing activation and command cases prove unmentioned drafts unchanged, bootstrap adopts live revisions and refuses a second bootstrap. |
| Staging atomicity/reuse/refusal | Existing builder cases prove transaction rollback on refusal, hash-based revision reuse, manifest/parent reuse, withdrawn-file rejection, empty selectable-set rejection and immediate tag associations. Added concurrency case covers new-only identical stages on an empty bootstrapped parent. |
| CHECK NULL semantics | Read all CHECKs in 0045–0048; NOT NULL guards mandatory fields. Independent 18-case lift timestamp/reason/authority NULL/blank matrix: zero unexpected acceptances, zero residual holds. |
| Backfill and indexes | Existing real-Postgres withdrawal cases replay 0045/0046, proving exact fixture exclusion and authored prefix inclusion. Activation cases cover release identity on parent/root; hold cases exercise unlifted uniqueness and lift-once behaviour. |
| Immutability | UPDATE rejection verified in source and Postgres tests. DELETE is permitted: a disposable SQL probe deleted a withdrawal and subsequent activation restored the question. No scoped runtime writer performs that delete. Do not describe these triggers as an authorization boundary against database-owner SQL. |
| N-1 | Serving readers do not use the new release/overlay tables. New constraints and migration lock modes were read in source. Historical claims that deployed tables were empty or migrations had particular production backfill counts were not reproduced remotely. Old operator tooling is not certified compatible with new constraints. |
| Visibility | Atomic commit gives no partial committed materialization. At READ COMMITTED, separate reader statements may straddle a commit. The repaired test identifies the actual paused backend and tests failure, commit and observation-failure cleanup. |
| Documentation | Documentation/fixture guard: **1,147 passed** locally. The guard validates local destinations and record lifecycle, not every external URL or heading anchor. Old production assignment timestamps, upstream private content specifications and clinical policy approval remain UNVERIFIED by this audit. |

## Writer inventory and lock argument

A whole-repository search for status/current-revision reads and writes found
129 candidate lines at the baseline. Runtime writers are:

- `scripts/content-release/release-activation.ts`: published/archive status and current revision; bootstrap and holds delegate here.
- `scripts/content-release/release-builder.ts`: new draft question/current first revision; existing revisions stay non-current.
- `scripts/seed/question-syncer.ts`: inserts and status changes.
- `scripts/seed/question-revision-writer.ts`: current revision, under its caller's lock; staging passes `makeCurrent: false`.
- `scripts/seed/placeholder-archiver.ts`: fixture status.
- `scripts/seed/withdraw-questions.ts`: withdrawal status.

Migration 0039's old synchronization function is historical; 0042 removes it.
Test helpers and fake repositories are not runtime writers.

After BUG-314, supported content writer transactions first lock the pointer
exclusively. They cannot hold conflicting question locks while waiting on one
another's pointer. Existing multi-question lock sets are in question-ID order;
new staged rows are invisible to other transactions until commit. A hold does
not lock its selected subset before activation's complete ordered set. Session
binding takes SHARE locks in that same order. Writer NO KEY UPDATE locks are
compatible with learner foreign-key KEY SHARE locks because these writers do
not change question IDs/slugs. This removes the reproduced cycles without
making learner writes acquire an operator lock. It is not a proof against
arbitrary administrator SQL, concurrent DDL, or transactions outside this
inventory. The direct seed remains per-question, not a whole-bundle transaction.

READ COMMITTED activation issues several statements, but supported staging,
seed and overlay writers cannot change its eligibility inputs between those
statements while it owns the pointer. It locks affected questions before
counting/writing. All materialization, pointer movement and receipt writes
commit or roll back together. The stored release and item update triggers and
verification checks protect the normal command path, with the DELETE limit
noted above.

## Red/green and mutation receipts

Tests were written before their corresponding implementation changes:

- Operator concurrency: **2 failed** before the fix.
- Placeholder/setup/visibility failures: **3 failed, 7 passed**, plus a driver
  error during broken visibility cleanup; fixed focused runs have no such error.
- Learner lock contracts: **3 failed** before lock-strength/order changes.
- Restored focused suite after mutations: **15 passed**.

Seven deliberate removals/changes each produced the intended failure:

| Mutation | Observed failing behaviour |
|---|---|
| Pointer lock changed back to SHARE | Concurrent identical stage hits question-slug uniqueness. |
| Activation question lock changed back to UPDATE | Activation cannot complete while learner FK transaction is open. |
| Hold locks selected subset first | Real session creation/hold deadlock (`40P01`). |
| Session binding ORDER BY removed | Higher row already locked while waiting on lower (`55P03`). |
| Placeholder predicate changed back to prefix | Archives two rows instead of only the fixture. |
| Failed-migration drop removed | Database inventory retains the failed setup's database. |
| Visibility unlock/settle removed | Injected observation-failure case times out before cleanup. |

Mutations were restored. Durable reproductions are the committed
`content-release-concurrency`, `content-release-reader-locks`,
`placeholder-archival-scope`, `disposable-database-cleanup` and
`content-release-verification` integration suites. Local raw logs are under
`/tmp/content-audit-*`; they are not durable CI receipts. Exact-head full-gate,
review and merge receipts are recorded in the PR, after those actions occur.
No dev-to-main promotion is part of this audit.

## Git/CI provenance read

Each scoped implementation PR has an exact-source-head APPROVED review and a
successful `test` check. Logs for each run were downloaded and their unit,
browser, integration and E2E summaries read:

| PR | Source head | Merge | CI run |
|---|---|---|---|
| #1290 | `b1fd97da` | `970015c8` | `36891309363` |
| #1292 | `89a5829b` | `2fa8aab6` | `36902462511` |
| #1294 | `e78bdbb9` | `a7f27fa7` | `36907158334` |
| #1296 | `545ba316` | `65ab9bd1` | `36915578187` |
| #1298 | `a622027e` | `46345b75` | `36943959910` |
| #1300 | `ef5105b3` | `312e4415` | `36948237522` |

This proves those GitHub receipts, not the current state of production.
The original DEBT-489 filing's 948 imported files are not a universal inventory:
this independent clone had zero imported MDX and ten committed fixtures.
