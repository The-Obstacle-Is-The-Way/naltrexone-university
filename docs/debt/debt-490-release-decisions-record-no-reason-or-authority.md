# DEBT-490: Release Removals and Activations Record No Reason or Authority

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open
**Priority:** P2
**Date:** 2026-10-02
**Resolved:** —
**Verification receipts:** —

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

- An activation, a rollback and a bootstrap each record a reason and an authority on their receipt.
- A withdrawal made by an `archived` removal records the activation's authority.
- The commands refuse `--apply` without `--reason` and `--authority`.
- Removing either field from the receipt write fails a case.

## Related

- [DEBT-489](./debt-489-release-removes-omitted-questions.md): its Fix's decision on removal reasons, which this record widens.
- [DEBT-483](./debt-483-content-withdrawal-and-release-rollback.md): ADR-021 phase 4, which built the release path.
- [ADR-021](../adr/adr-021-question-revisions-and-content-releases.md), decision 4.
- [`content-pipeline.md`, Releases](../practice-engine/content-pipeline.md#releases-bootstrap-stage-activate-roll-back-and-hold).
