# DEBT-489: A Release Silently Removes Every Live Question Its Bundle Omits

**Status:** In Progress. Filed 2026-10-02 and fixed in code the same day ([Fix](#fix--2026-10-02)): explicit removals, staging that records no withdrawal (tags still change when staged) and an apply bound to its reviewed plan. It closes with [DEBT-483](./debt-483-content-withdrawal-and-release-rollback.md) once the fix is released. Until then it blocks the owner's decision to bootstrap production releases.
**Priority:** P1
**Date:** 2026-10-02
**Confidence:** CONFIRMED by reproduction on a disposable database. Not live: no production release is active, so production still seeds directly.

## Summary

ADR-021's releases are complete snapshots, which is intended: activating a release makes the bank exactly that release, minus withdrawals and holds. But a release is built only from the MDX files present when it is staged. So a live question leaves the bank simply because its file was absent from the bundle. The release cannot tell a question retired on purpose from one whose file was missing. Staging gives no warning, and the only safeguard is an operator reading the `archived=` count in the activation preview.

## Evidence

- **Activation archives what a release omits.** `scripts/content-release/release-activation.ts` (step 4, materialization) archives every published question the release does not name, by design (ADR-021 decision 4; DEBT-483's phase 4 design).
- **Staging names only the files it reads.** `scripts/content-release/release-builder.ts` names each `published` file in the bundle. `stage-release.ts` reads `content/questions/**/*.mdx`, excluding placeholders (`readSeedQuestionFiles(false)`).
- **The authored corpus differs per machine.** It is generated and gitignored: 948 files in `content/questions/imported/`, built per machine from drafts. Only the 10 placeholder fixtures are committed.
- **The manifest cannot say what was removed.** `app-release-manifest-v1` lists only items. It has no record of what the release removes relative to its parent, or why. *(Manifest v2 names removals; see [Fix](#fix--2026-10-02).)*
- **The existing safeguards are thin:**
  - a bundle with no published file is refused;
  - the dry run prints `archived=N`;
  - a rollback restores the previous release.

  Nothing requires the count to be read, and staging reports no omission.
- **A fully missing folder is already safe.** The seed reader refuses an empty bundle. The risk is a stale or partial folder, which `content-pipeline.md` §16 already documents for the direct seed ("the older files win").

## Reproduction (disposable database, 2026-10-02)

50 live questions were seeded and bootstrapped. A release was then staged from a bundle holding 10 of their 50 files, as an older clone or a partial drafts checkout would produce:

```
STAGE    items=10 inserted=0 appended=0 reused=10      (no warning)
PREVIEW  items=10 published=0 archived=40              (the only signal)
APPLY    archived=40
AFTER    {"published":10,"archived":40}
ROLLBACK published=50
```

The reproduction ran as a throwaway integration test that drove `stageReleaseFromFiles` and the `activate-release.ts` command in-process. It becomes a regression case in the fix.

## Failure scenario

Production has been bootstrapped. An operator stages from a clone whose imported tree is stale or partial. Staging succeeds quietly. If the preview's count is not read, applying it takes hundreds of questions out of the bank at once:
- new sessions no longer select them;
- learners who attempted them see them marked withdrawn;
- in-progress sessions keep their bound items.

A rollback restores them, but only after someone notices.

## Why this is a gap in the design, not its intent

Complete, immutable snapshots are the right model for what is live. Rollback, verification and "never resurrect withdrawn content" depend on it (Kleppmann's derived state; Humble and Farley's immutable release artifacts). What is aberrant is deletion by absence. Mature declarative systems guard exactly this:
- Terraform lists every destroy in a plan and applies only the saved plan.
- `kubectl apply --prune` is opt-in.

Our activation has neither guard: a missing input becomes a deletion, and the apply is not bound to the reviewed preview.

## Options considered

1. **An expected-count flag** (`--expect-archived N`). Cheap, but a count can match while the set of questions differs. Rejected as the main fix. *(A first attempt at this was started before this investigation, then set aside: the fix came before the finding.)*
2. **A removal budget** (refuse past a percentage). The threshold is arbitrary, and it hides small mistakes. Rejected.
3. **Explicit removals at staging.** A live question may leave the bank only through an explicit `archived` or `draft` status in its file, or an explicit `--remove <qid>`. Staging refuses a bundle that omits a live question, names the omitted QIDs and writes nothing. Absence never means removal. This fixes the root cause, at the input.
4. **Plan-bound apply.** The activation preview prints a plan id: a canonical hash of the target release, expected active release, the complete eligible `(questionId, questionRevisionId)` set and the exact archive set. Applying requires that id, and activation refuses if the release, expected base, revisions or sets it would now apply differ. The reviewed preview becomes the contract, as Terraform's saved plan is. This fixes the apply, and covers rollbacks too.

## Decision (under the owner's delegation)

Options 3 and 4 together: explicit removals guard the input, and plan binding guards the apply. A rollback goes through the same preview and plan id as any activation. The independent review below refined the design before it was built; the [Fix](#fix--2026-10-02) records what was built.

## Independent design review — 2026-10-02

The 50/10 omission and rollback were independently reproduced on this PR's
head using the disposable-database helper: 40 archived, 10 published, then
40 restored. The record describes a confirmed operator-safety defect, not a
production incident. Production state has not been queried in this review.

Explicit intent plus a reviewed plan is preferable to count thresholds. The
implementation must also cover these boundaries:

- **Held members still belong to the parent.** Compare the bundle against the
  active release's membership, not only `status = 'published'`. Otherwise a
  held question can disappear implicitly, and lifting its hold cannot return
  it because the new release no longer names it. Permanently withdrawn members
  can be excluded without allowing their resurrection.
- **Review revisions and reasons.** A plan hash alone is not a review surface.
  Print the named additions, revision changes, removals and overlay exclusions,
  and preserve explicit removal intent and reason with the staged artifact.
  A `draft` file drops membership; an `archived` file currently records a
  permanent question-wide withdrawal. These are different decisions.
- **Check and apply under one lock boundary.** Recompute the plan under the
  pointer and affected-question locks and use that result for the writes.
  An earlier comparison outside the transaction is a time-of-check race.
  Include unchanged eligible revisions, not only rows an UPDATE would touch.
- **Concurrent staging.** Bind removal review to the same parent used to build
  the release. Reject a stale parent, and test identical concurrent staging as
  well as different bundles on the same parent. A uniqueness constraint alone
  does not guarantee both callers receive the reused release.
- **Rollback preserves current clinical decisions.** Apply current withdrawals
  and holds; reject a changed plan. Rollback does not unconditionally restore
  everything: an independently recorded withdrawal is permanent.
- **Staging has another persistent effect besides tags.** An authored archive
  records withdrawals during staging (`recordSeedWithdrawal`). Abandoning that
  release does not undo them; re-applying another release observes them.
  Plan binding cannot make this effect private to the abandoned release.
  The implementation must explicitly decide whether staged removal means an
  immediate global withdrawal or deferred release-local intent.

This review refines the design only. DEBT-489's implementation belongs to the
parallel session and is not changed here.

## Fix — 2026-10-02

Built to the decision above and to every boundary in the independent review.

**Manifest v2** (`app-release-manifest-v2`). A manifest names the release's items (slug and content hash) and its removals (slug and kind). Removals are hashed with the items, so they are part of the release's identity. There are three kinds:
- `archived`: the file is set to `archived`. A permanent withdrawal, recorded when the release activates.
- `draft`: the file is set to `draft`. The question is out of the bank until a release names it again.
- `removed`: the file is absent, and the operator named its QID with `--remove`.

No release exists on Preview or production to carry the old format: per the records, neither has been bootstrapped, and staging needs an active release. So v2 replaces v1 rather than reading both.

**Staging** (`stage-release.ts`, with `--remove <qid>` once per question):
- Every member of the active release, held ones included, must appear in the bundle or be named with `--remove`. A withdrawn member may be absent, since it can never return.
- A bundle that leaves out any other member is refused. The error names the missing QIDs, and nothing is written.
- `--remove` must name a member whose file is absent. A QID whose file is in the bundle, or that the active release does not name, is refused.
- Staging records no withdrawal. An abandoned release leaves behind only what no learner sees (drafts, non-current revisions, the release itself) and its tag changes, since tags are not versioned (ADR-021 decision 1).
- Stagings run one at a time. Since [BUG-314](../bugs/bug-314-content-hold-withdrawal-deadlock.md), every content writer takes the release pointer exclusively, so a second identical staging reuses the first's release.

**Activation**, under the pointer and question locks:
- A release never active before must account for every member of the active release: as an item, as a removal, or as a withdrawn question. Otherwise it is refused (`INCOMPLETE_RELEASE`). This repeats staging's check where the release is applied, so a release staged any other way is held to it too. A rollback is exempt, because it restores a snapshot that was live before.
- It records the withdrawals for `archived` removals, with reason `archived in content release <release id>` and authority `content release`. So each withdrawal names the release whose manifest decided it.
- It computes its plan, then applies exactly that plan.

**The plan.** Its id is the SHA-256 of canonical JSON naming:
- the release, by its identity: its manifest hash and parent, unique by migration 0048;
- the release it replaces;
- every eligible (question, revision) pair, unchanged ones included;
- every question it archives;
- every question it withdraws.

The preview prints the id and the changes it names: questions archived, questions published or moved to another revision, questions withdrawn for good, and items a hold or a withdrawal leaves out. `--apply` requires `--plan <id>`. The apply recomputes the plan under its own locks, and if it differs, nothing is applied (`PLAN_MISMATCH`).

The plan names the release by identity rather than by row id. That lets the bootstrap use the same contract: its release is created inside its own transaction, so a preview and an apply give the same release different row ids. `bootstrap-release.ts --apply` likewise requires the `--plan` its preview printed, and adopts nothing if what is live has changed since.

**What needs no plan.** A hold or a lift re-applies the active release inside its own transaction, under the same locks, and cannot activate any other release. Every apply of `activate-release.ts`, rollbacks included, needs a plan.

**Decided: a removal records its intent, not a free-text reason.** The review asked to preserve each removal's intent and reason. The manifest records the intent (the kind). For the permanent case, the withdrawal record names the release, and the authored reason lives in the content repository's history of that file. A `draft` or `removed` question can come back in a later release, so it is not a clinical record. If the owner wants a recorded reason for `--remove`, it can become a manifest field before the production bootstrap, while no release exists there.

**The review's boundaries:**

| Boundary | How the fix meets it | Test |
|---|---|---|
| Held members belong to the parent | Staging and activation compare against the active release's items, held ones included | builder: *counts a held question as live, and lets a withdrawn one be left out* |
| Review revisions and reasons | The preview names every change, including overlay exclusions; the manifest keeps each removal's kind; reasons as decided above | plan: *names every change in the plan…*, *names the items a hold or a withdrawal leaves out* |
| One lock boundary | The plan is computed under the pointer and question locks, by the same predicates as the writes, and includes unchanged eligible revisions | plan: *refuses a plan id that no longer matches, changing nothing* |
| Concurrent staging | A release never active before must be built on the active one; stagings are serialized (BUG-314) | activation: *rejects a new release built on an earlier release…*; concurrency: *reuses the release when identical new-only bundles stage concurrently* |
| Rollback keeps current clinical decisions | The overlay applies to a rollback, and its plan is bound | activation: *rolls back to an earlier release without resurrecting a withdrawn question*; plan: *gives a rollback its own plan, which must match too* |
| Staging's lasting withdrawal | Withdrawals of `archived` removals move to activation | removals: *withdraws an archived removal when its release activates, and not before* |
| The bootstrap's inventory | The bootstrap's apply is bound to its preview's plan | plan: *binds a bootstrap to the live questions its preview adopted* |

## Verification

All on disposable databases. Each case was red before its code existed, or fails under a mutation of that code.
- **The omission is refused at staging.** A bundle with 2 of 5 live files (the reproduction's shape, smaller) is refused. The error names the 3 missing QIDs, and nothing is written. The same questions set to `archived` or `draft`, or named with `--remove`, stage.
- **Activation refuses an incomplete new release** built outside the stager, and lets a rollback restore an earlier snapshot.
- **The apply is bound to its plan.** A plan that no longer matches, because a question was withdrawn after the preview, is refused and changes nothing. So is the plan of a different release with the same effect (one question dropped as a draft instead of with `--remove`). A matching plan applies, for a rollback and for a bootstrap too. The commands refuse `--apply` without `--plan`.
- **Mutations.** 13 targeted mutations of the fix, run against the rebased head. 12 fail at least one case:
  - activation's completeness check, and its rollback exemption;
  - the withdrawal at activation, and its release-naming reason;
  - staging's omission check, its withdrawn-member exemption, and both `--remove` guards;
  - the plan comparison, and the plan's manifest and publish-set entries;
  - the bootstrap passing its plan on.

  One survives: dropping the replaced release from the plan. The stale check already refuses an apply whose active release differs from the one it names, so this entry adds no protection on its own. It stays, so that the plan names the whole transition.
- **No fail-open exclusion.** Promotion #1306's review found that activation's completeness check excluded named removals with `NOT IN (subquery)`, which matches no row if the subquery yields a NULL. That would let the check pass silently. It could not happen then, since the manifest is validated earlier in the same transaction, but the guard no longer depends on that: every exclusion is now `NOT EXISTS`. Removing that clause fails 6 cases.
- **A precedence trap, closed.** The first query naming the overlay's exclusions wrote `NOT ${ELIGIBLE}`, which expanded to `NOT NOT withdrawn AND NOT held`. Existing count assertions caught it at once. The fragment is now parenthesized where it is defined, so every use negates and combines it as one condition.

## Related

- [DEBT-483](./debt-483-content-withdrawal-and-release-rollback.md), whose phase 4 built the release system.
- [ADR-021](../adr/adr-021-question-revisions-and-content-releases.md), decisions 4–6.
- [`content-pipeline.md` §16](../practice-engine/content-pipeline.md), stale clones.
