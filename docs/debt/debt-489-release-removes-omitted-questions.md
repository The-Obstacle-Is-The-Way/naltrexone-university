# DEBT-489: A Release Silently Removes Every Live Question Its Bundle Omits

**Status:** Active. Filed 2026-10-02. It blocks the owner's decision to bootstrap production releases ([DEBT-483](./debt-483-content-withdrawal-and-release-rollback.md)).
**Priority:** P1
**Date:** 2026-10-02
**Confidence:** CONFIRMED by reproduction on a disposable database. Not live: no production release is active, so production still seeds directly.

## Summary

ADR-021's releases are complete snapshots, which is intended: activating a release makes the bank exactly that release, minus withdrawals and holds. But a release is built only from the MDX files present when it is staged. So a live question leaves the bank simply because its file was absent from the bundle. The release cannot tell a question retired on purpose from one whose file was missing. Staging gives no warning, and the only safeguard is an operator reading the `archived=` count in the activation preview.

## Evidence

- **Activation archives what a release omits.** `scripts/content-release/release-activation.ts` (step 4, materialization) archives every published question the release does not name, by design (ADR-021 decision 4; DEBT-483's phase 4 design).
- **Staging names only the files it reads.** `scripts/content-release/release-builder.ts` names each `published` file in the bundle. `stage-release.ts` reads `content/questions/**/*.mdx`, excluding placeholders (`readSeedQuestionFiles(false)`).
- **The authored corpus differs per machine.** It is generated and gitignored: 948 files in `content/questions/imported/`, built per machine from drafts. Only the 10 placeholder fixtures are committed.
- **The manifest cannot say what was removed.** `app-release-manifest-v1` lists only items. It has no record of what the release removes relative to its parent, or why.
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
4. **Plan-bound apply.** The activation preview prints a plan id: a hash of the exact question sets it would publish and archive. Applying requires that id, and activation refuses if the plan it would now apply differs. The reviewed preview becomes the contract, as Terraform's saved plan is. This fixes the apply, and covers rollbacks too.

## Fix (decided under the owner's delegation)

Options 3 and 4 together: explicit removals guard the input, and plan binding guards the apply.
- Re-applying the active release (holds) and the bootstrap are unaffected.
- A rollback goes through the same preview and plan id as any activation.

## Verification

- A bundle omitting a live question is refused, naming the QIDs and writing nothing. The same bundle with that question marked `archived`, `draft` or `--remove` stages.
- An activation applied with a plan id other than its current plan is refused and writes nothing. A matching plan id applies, including for a rollback.
- The reproduction above is a regression case: the 10-of-50 bundle is refused at staging.

## Related

- [DEBT-483](./debt-483-content-withdrawal-and-release-rollback.md), whose phase 4 built the release system.
- [ADR-021](../adr/adr-021-question-revisions-and-content-releases.md), decisions 4–6.
- [`content-pipeline.md` §16](../practice-engine/content-pipeline.md), stale clones.
