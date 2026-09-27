# ADR-021: Immutable Question Revisions and Atomic Content Releases

**Status:** Accepted, except the release-zero content-hash form (open question below)
**Date:** 2026-09-27
**Decision Makers:** The owner, who authorized paying down DEBT-483 and DEBT-484 on 2026-09-27. The release-zero hash form awaits the owner's answer to the open question below.
**Depends On:** ADR-003 (Testing Strategy); the content repository's SPEC-007 (Release and Withdrawal Interface, Draft) and SPEC-005 (content identity)

---

## Context

Two P1 records describe the same missing structure.

- [DEBT-484](../debt/debt-484-question-rewrite-history-identity.md): a question is one mutable row. Its stem, explanation, reference and choices are overwritten in place by the seed. An attempt stores only `question_id` and a `selected_choice_id`, so it cannot say which content the learner answered.
  - The #951 guard refuses substantive rewrites once graded history exists. It does not store revisions.
  - It does not protect a learner who is viewing an ungraded item while the seed changes it.
  - It does not make a withdrawn question reviewable, because every history read filters on `status = 'published'`.
- [DEBT-483](../debt/debt-483-content-withdrawal-and-release-rollback.md): content becomes visible question by question. The seed commits per question, and withdrawal is an explicit per-QID command. There is no release identity, no all-or-nothing activation and no rollback that respects revocations.

The content repository's SPEC-007 defines the cross-repository release interface: an immutable, hash-addressed manifest; staging and one atomic activation; explicit withdrawals and holds; a revocation overlay; rollback. It assigns *verification and activation* to the app. This record decides the app's side of that contract.

Constraints:
- Production migrations run in the Vercel build before the new deployment serves ([Migration Authoring](../dev/migration-authoring.md#deployed-code-compatibility)). Every step is therefore expand/contract, with an explicit N-1 answer.
- Attempts and session states reference choice rows through composite `(choice id, question id)` foreign keys with `ON DELETE RESTRICT`. Existing IDs must survive.

## Decision

### 1. Content lives in immutable revisions

- A new `question_revisions` table holds everything a learner reads: `stem_md`, `explanation_md`, `reference_md` and `difficulty`, plus `canonicalization_version` and `content_hash`.
- `choices` gains `question_revision_id`. A choice belongs to exactly one revision, and its label and sort-order uniqueness move from `question_id` to `question_revision_id`. `question_id` stays, because the attempt and session-state foreign keys are composite `(choice id, question id)`.
- A revision is never updated. Changed content is a new revision; the old one stays addressable.
- `questions` keeps the stable identity (`id`, `slug`) and gains `current_revision_id`, the revision new selections use. Its text columns become legacy and are dropped in a later contract step.

**Backfill.** Revision 1 of each existing question copies its current row. Its choices *keep their existing UUIDs* and are attached to it, so every `selected_choice_id`, `latest_selected_choice_id` and `draft_selected_choice_id` still resolves, now to a specific revision.

### 2. History and sessions bind to a revision

- `attempts.question_revision_id` and `practice_session_question_states.question_revision_id` are added, nullable at first. A session binds each item's revision when it is created, and an attempt binds the revision it graded.
- Submitting an answer grades against the session state's bound revision, never whatever is current. A content change during a session therefore cannot re-key a learner's answer. This closes the active-session race.
- **A selected choice must belong to the bound revision, and the database enforces it** (#1166 review). The existing `(choice id, question id)` foreign keys cannot: a choice from another revision of the same question satisfies them. So `choices` gains a unique key on `(id, question_revision_id)`. Attempts and session states (latest and draft selections) gain composite foreign keys `(selected choice id, question_revision_id) → choices(id, question_revision_id)` once their revision column is bound. Grading and the session writers validate first, for a clear error, rather than relying on the constraint violation alone. The `(choice id, question id)` keys stay until the contract phase.
- After a re-runnable backfill sweep covers every row, the columns become `NOT NULL` in a later contract migration.

### 3. Review reads the bound revision, including for withdrawn questions

- History, session review, previous-attempt and bookmark reads resolve content through the attempt's or session state's revision, not through `status = 'published'`.
- A withdrawn question stays reviewable **by learners who attempted it**, and every such view carries a visible withdrawal notice.
  - This follows medical publishing's retraction practice (COPE): the record stays available and is clearly marked, never silently removed.
  - It needs a documented Pattern Registry entry before the UI lands.
- Learners who never attempted a withdrawn question never see it.

### 4. Releases activate atomically

- A release is recorded in `content_releases`: `release_id`, `manifest_hash`, `parent_release_id`, the stored manifest, and verification and activation receipts.
- Its selectable set is recorded in `content_release_items` as `(question_id, question_revision_id)` pairs.
- Staging writes revisions and items invisibly.
- Activation is one transaction. It compares the single active-release pointer against `parent_release_id` and the verified eligibility revision, then swaps it. On any failure the previous release stays active.
- New-question selection reads the active release's items instead of `status = 'published'`. `questions.status` then becomes derived and is retired in a contract step.

### 5. Withdrawals and holds are a current overlay

- Withdrawals and holds live in their own tables, keyed by `(question_id, question_revision_id)` with reason, authority and effective time. They are independent of any manifest.
- Selection excludes overlaid revisions even under an older release, so rollback never resurrects a revoked item.
- Emergency withdrawal uses the same path with a minimal manifest.
- The existing explicit-QID withdrawal command becomes a writer to this overlay.

### 6. The seed becomes a release builder

Today's MDX seed stays the local and test fixture path. In production, content changes arrive only as verified releases. The seed's per-question transactions and the #951 guard are superseded by revisions (a rewrite is a new revision) and by atomic activation. Neither is relabeled as atomic before these structures exist.

## Phasing

Each phase is its own reviewed PR series with an N-1 answer. No phase claims SPEC-007 implemented.

| Phase | Change | N-1 answer |
|---|---|---|
| 1 | Add `question_revisions`, `choices.question_revision_id`, and the nullable revision columns on attempts and session states. Backfill revision 1. The seed writes a new revision for changed content. | Serving code ignores the new columns, and the backfill adds rows without altering existing ones. Rows the serving code writes during the overlap are covered by a re-runnable sweep. |
| 2 | Sessions and attempts bind revisions; grading and every review read use them. The `(choice, revision)` unique key and composite foreign keys land here. Add the withdrawal notice for attempted withdrawn questions. | Old code still reads the unchanged legacy columns. |
| 3 | Contract: `NOT NULL` revision columns after a verified sweep; drop the legacy text columns from `questions`. | Only after N-1 code that reads legacy columns can no longer serve. |
| 4 | Releases, staging, atomic activation, the withdrawal and hold overlay, and rollback. Selection reads the active release. | The legacy `status` stays in step until the release pointer is authoritative. |
| 5 | Release zero, the inventory of what is live: blocked on the open question below. | Read-only export. |

## Open question for the owner: the release-zero content hash

SPEC-007 asks the app to export each live question "in the form SPEC-005 hashes", which is `parsed-block-json-v1`. That form is SHA-256 over sorted-key JSON of `{metadata, body}` as the content repository's `scripts/content_io.py` parses a **draft block**.

The app stores parsed fields after two transformations, draft → MDX → rows, and does not retain the draft's YAML and Markdown layout. A draft-form export rebuilt from stored fields would make every whitespace or ordering normalization look like content drift.

**Recommendation:** agree a second canonical form in both repositories, `stored-fields-json-v1`: sorted-key JSON of exactly the fields the app stores and renders. The content repository computes it from each parsed block through the importer's own mapping, and the app computes it from rows. Release zero then compares like with like. A true discrepancy, meaning a live body edited after import, is still caught.

This is a change to the content repository's SPEC-005/SPEC-007, so the owner decides it. The app will not edit that repository.

## Consequences

- DEBT-484 closes after phases 1–3: rewrites become revisions, history and sessions bind them, and withdrawn questions are reviewable with a notice.
- DEBT-483 closes after phase 4, and release zero once the open question is settled.
- Every history read path changes in phase 2. Each gains a real-Postgres case, and the existing unavailable-row UI becomes the withdrawal-notice UI.
- Revisit this record if SPEC-007's manifest fields change, or if the owner chooses the draft-form hash.

## Related

- [DEBT-483](../debt/debt-483-content-withdrawal-and-release-rollback.md), [DEBT-484](../debt/debt-484-question-rewrite-history-identity.md)
- [Migration Authoring](../dev/migration-authoring.md)
- Content repository: SPEC-005, SPEC-007, ADR-001 (repository boundary)
