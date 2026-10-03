# DEBT-490: Release Removals and Activations Record No Reason or Authority

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved — 2026-10-02; every activation, rollback and bootstrap records its reason and authority on an immutable receipt, promoted and release-verified, with migration `0049` applied in production and its suites re-run on `main`'s code before archival
**Priority:** P2
**Date:** 2026-10-02
**Resolved:** 2026-10-02
**Verification receipts:** [Verified closeout](#verified-closeout--2026-10-02-utc)

---

## Summary

The withdrawal and hold commands require an operator-supplied `--reason` and `--authority`, and a lift records its own. Since [DEBT-489](./debt-489-release-removes-omitted-questions.md)'s fix, a release can remove live questions, and an activation can publish, archive and permanently withdraw them. But the release path records no operator-supplied reason or authority anywhere:
- an activation, a rollback or the bootstrap records only the release, the release it replaced and the time;
- a `--remove` removal records only its kind, in the manifest;
- a permanent withdrawal made by an `archived` removal records generated metadata only: the reason `archived in content release <release id>` and the fixed authority `content release`. It names no person and no rationale.

The direct seed's withdrawals for MDX archives use generated metadata the same way (see Evidence), so this is not new to releases. It matters more now because releases make removal and rollback routine operator actions.

**Not live.** No production release exists. The gap becomes live with the production bootstrap, the owner's pending decision.

## How this was found

On 2026-10-02 a side summary of DEBT-489's decision said that removals keep no written reason, only a generic one for permanent removals, and the owner asked whether that was true and whether it mattered. DEBT-489's [Fix](./debt-489-release-removes-omitted-questions.md#fix--2026-10-02) had recorded a narrower decision: a removal records its intent (its kind), not a free-text reason, and a recorded reason for `--remove` was left as the owner's call. The investigation below confirms the summary. It also finds the gap is wider than removals: activations themselves are unattributed.

## Evidence

Code at `9db189be`:
- **Activation receipts.** `content_release_activations` (migration `0047`, `db/schema.ts`) holds `release_id`, `previous_release_id` and `activated_at`. There is no reason, authority or operator.
- **Releases.** `content_releases` holds `manifest`, `manifest_hash`, `parent_release_id` and `created_at`, with no author.
- **Removals.** A manifest v2 removal is `{slug, kind}` (`scripts/content-release/release-manifest.ts`). `stage-release.ts` accepts `--remove <qid>` with no reason.
- **Withdrawals made by a release.** `release-activation.ts` records an `archived` removal's withdrawal with the generated reason `archived in content release <release id>` and the fixed authority `content release`.
- **The precedent.** Before releases, the direct seed records an MDX archive the same way, with reason `archived in seed input` and authority `content seed` (`scripts/seed/question-syncer.ts`). Authored archives have never carried a person or a reason, and DEBT-489 kept that precedent.
- **The contrast.** `withdraw-questions.ts` and `hold-questions.ts` require `--reason` and `--authority` (`scripts/seed/qid-command-args.ts`), and a lift records `lift_reason` and `lift_authority` (migration `0048`).
- **Not shown to learners.** No application code under `src/`, `app/`, `lib/` or `components/` reads a withdrawal's or hold's reason or authority. They are an operator audit record. The gap affects accountability, not what learners see.

## Impact

- **Accountability.** After a release removes or permanently withdraws clinical content, the database cannot say who decided it or why. For a file set to `draft` or `archived`, the answer may be in the content repository's history. For `--remove`, an activation or a rollback, it is nowhere.
- **Clinical review.** A permanent withdrawal made through a release looks, in its record, like routine content maintenance. One made with the withdrawal command names a person and a reason.
- **Incident review.** A rollback, the response to a bad release, records no reason.
- **Not a correctness defect.** Releases, plans and the overlay behave as designed. DEBT-489's plan binding guarantees that what is applied is what was reviewed; this debt is about recording who reviewed it, and why.

## Options

1. **Reasons in the manifest** (a format v3, with a reason on each removal). Not recommended as the main fix. A manifest is a release's content identity: migration `0048` keys a release by its manifest and parent. So the same content staged for two reasons would become two releases. And once production has releases, the app would have to read both v2 and v3.
2. **Attribute every activation (recommended).**
   - `activate-release.ts` and `bootstrap-release.ts` require `--reason` and `--authority`, as the overlay commands do, and the activation receipt records them. That needs a migration adding two columns to `content_release_activations`.
   - An activation's `archived` removals record that authority and reason in their withdrawals, instead of the fixed `content release`.
   - The plan the operator applies already names every removal, so one decision record covers exactly the reviewed transition, rollbacks included. The manifest, and so release identity, is unchanged.
3. **Per-removal notes at staging**, in a side table keyed by release and question. This is finer-grained. But a reused release (the same manifest on the same parent) would collect notes from separate stagings. Staging is also not the decision point; activation is. It remains an extension of option 2 if per-question reasons prove necessary.

## Recommendation and timing

Option 2, before the production bootstrap, so that the first production release is attributed. It changes no manifest, so it could also land after the bootstrap without supporting two formats; only the activations made before it would lack a record. When to bootstrap remains the owner's decision; this record asks that the decision take it into account.

## Resolution

1. Red tests first: an activation, a rollback or a bootstrap without a reason or an authority is refused, both by the command and by the function.
2. A migration adds `reason` and `authority` to `content_release_activations`. Per the records, no remote database has an activation yet. The migration still states its answer for existing rows, and its N-1 answer.
3. `activateRelease` and `bootstrapRelease` take and record them. The hold command's internal re-application records the hold's own reason and authority.
4. A withdrawal made by an `archived` removal records the activation's authority, and a reason naming the release and the activation's reason.
5. The preview prints them. The plan id does not include them: they record the decision, not the transition.
6. Update the pipeline guide's Releases section and ADR-021's boundary paragraph.

## Verification

Each item is its own case, so that each guard is shown to work on its own:
- **Function boundary.** `activateRelease` refuses a missing reason, and separately a missing authority, and writes nothing. So does `bootstrapRelease`.
- **Command boundary.** `activate-release.ts` and `bootstrap-release.ts` refuse `--apply` without `--reason`, and separately without `--authority`.
- **Receipts.** An activation, a rollback and a bootstrap each record the reason and the authority on their receipt.
- **Holds.** A hold's or a lift's re-application of the active release records the hold's or lift's own reason and authority.
- **Withdrawals.** A withdrawal made by an `archived` removal records the activation's authority, and a reason that contains both the release id and the activation's reason.
- **Preview.** The preview prints the reason and the authority.
- **Plan.** The plan id does not depend on them: the same transition previewed with different reasons has the same plan id.
- **Mutations.** Removing the reason or the authority from the receipt write, from the withdrawal, or from the preview output fails a case.

## Fix — 2026-10-02

Option 2, started on the owner's go-ahead (2026-10-02, "DEBT-490 now").

**Migration `0049_debt490_activation_decision_record`.**
- `content_release_activations` gains `reason` and `authority`, both `NOT NULL` and non-blank (`~ '[^[:space:]]'`, as `question_withdrawals`).
- An existing receipt, which per the records only local databases have, gets an explicit marker, `not recorded: activated before DEBT-490` and `not recorded`, rather than a guessed decision. A notice counts those receipts in the deploy log. The defaults are dropped at once, so every new receipt must name its own.
- The receipt also becomes immutable, through 0047's `reject_immutable_row_update_v1`, as releases, items and withdrawals are. This step was not in the Resolution above. A decision record that can be edited afterwards would undo the point of keeping it.
- N-1: the serving deployment reads and writes none of this table. An older script that names no decision now fails on `NOT NULL`, instead of writing an unattributed receipt.

**Code.**
- `activateRelease` and `bootstrapRelease` take a `record: DecisionRecord`, the type the withdrawal and hold commands already use. They refuse a blank reason or authority before anything is locked or written (`DECISION_REQUIRED`), and the receipt records both.
- A withdrawal made by an `archived` removal records the activation's authority, and the reason `archived in content release <release id>: <activation reason>`.
- A hold's or a lift's re-application of the active release records `hold placed: <reason>` or `hold lifted: <reason>`, with the hold's or lift's authority.
- `activate-release.ts` and `bootstrap-release.ts` require `--reason` and `--authority` for a preview too, as the withdrawal and hold commands do, and print `Decision: …`. The apply command they print repeats the decision, quoted for a POSIX shell, apostrophes included. The plan id does not include the decision: it records the decision, not the transition.
- The flag parsing is shared with the QID commands (`readDecisionFlag`, `requireDecision` in `scripts/seed/qid-command-args.ts`).

**Tests**, red first:
- `content-release-attribution` covers each Verification item as its own case. It also tests the migration itself on a database migrated to 0048 with a receipt in 0048's shape: the receipt is marked, a new receipt that omits either field is refused, and an update is refused.
- The parser and command cases cover the flags, the printed decision and the quoted apply command.
- The activation suite reached the 800-line limit with the new fields, so its direct-seed cases moved, unchanged, to `content-release-seed-guard`.

**Mutations.** Fourteen targeted mutations, and every one fails a case:
- the migration's two marker defaults, its two dropped defaults, its two blank checks and its trigger (the first test let a kept `reason` default survive, because its insert omitted both fields; it now omits each field separately);
- the up-front refusal;
- the receipt's reason and its authority;
- the withdrawal's authority;
- the hold's decision;
- the printed decision, for both commands (the activation's survived until its command test asserted the line).

## Related

- [DEBT-489](./debt-489-release-removes-omitted-questions.md): its Fix's decision on removal reasons, which this record widens.
- [DEBT-483](./debt-483-content-withdrawal-and-release-rollback.md): ADR-021 phase 4, which built the release path.
- [ADR-021](../../adr/adr-021-question-revisions-and-content-releases.md), decision 4.
- [`content-pipeline.md`, Releases](../../practice-engine/content-pipeline.md#releases-bootstrap-stage-activate-roll-back-and-hold).

## Verified closeout — 2026-10-02 UTC

| Verification | Holds | Receipt |
| --- | --- | --- |
| Function boundary: a missing reason, and separately a missing authority, is refused by `activateRelease` and by `bootstrapRelease`, writing nothing | Yes | `content-release-attribution`: *refuses an activation without a reason / an authority, writing nothing*; *refuses a bootstrap without a reason / an authority, writing nothing* |
| Command boundary: `--reason` and `--authority` each required | Yes | `release-command-args.test.ts`: the activation's and the bootstrap's `--reason is required` / `--authority is required` cases |
| Receipts for an activation, a rollback and the bootstrap | Yes | *records the reason and authority of the bootstrap, an activation and a rollback on each receipt* |
| A hold's or a lift's re-application records its own decision | Yes | *records a hold's and a lift's own reason and authority when they re-apply the release* |
| An archived removal's withdrawal carries the activation's authority, and a reason naming the release and the activation's reason | Yes | *withdraws an archived removal on the activation's authority, naming the release and its reason* |
| The preview prints the decision | Yes | `content-release-commands`: both commands' `Decision: …` lines, and the shell-quoted apply command |
| The plan id does not depend on the decision | Yes | *gives the same transition the same plan id whatever its reason* |
| Mutations | 14 of 14 fail a case | Recorded in the Fix section |

The suites were re-run on `main`'s code before archival, on a branch based on `main` at `a9a98421`: the attribution, commands and seed-guard integration files (30 cases) and the script unit files (127 cases) passed.

**Increment.** #1322 (**5398018105** on `71fe7e13`; merged `81ffd15a`). One review finding was fixed: a moved placeholder-archival case could pass vacuously, and now asserts all ten fixtures.

**Release.** Promotion #1323 (`a9a98421`, merged **00:29:08Z** on 2026-10-03 UTC after a passing `verify-promotion` receipt): main CI **37082256459** `test` passed **00:42:26Z**, production assigned **00:42:28.423Z**, trees `b18dd7dd`, healthy production.

**The migration in production.** The production build's log shows:
- the pre-check: "Applied migration content matches the checkout";
- 0049's notice: **"0 existing receipts marked not recorded"**, so production had never activated a release;
- the post-check: "Ledger and migration content exactly match the checkout".

The production bootstrap no longer waits on this record; it remains the owner's decision.

