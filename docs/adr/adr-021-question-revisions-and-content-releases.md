# ADR-021: Immutable Question Revisions and Atomic Content Releases

**Status:** Accepted
**Date:** 2026-09-27; release-zero hash form decided 2026-09-28
**Implementation:** Decisions 1–3 and phases 1–3 are in production as of 2026-09-30 ([DEBT-484](../_archive/debt/debt-484-question-rewrite-history-identity.md#verified-closeout--2026-09-30-utc), resolved). Phase 4 is in production as of 2026-10-02 ([DEBT-483](../_archive/debt/debt-483-content-withdrawal-and-release-rollback.md#verified-closeout--2026-10-02-utc), resolved), built in steps from its [design](../_archive/debt/debt-483-content-withdrawal-and-release-rollback.md#phase-4-design--2026-10-01). Its first, 4a (migrations `0045` and `0046`, 2026-10-01), records withdrawals. 4b (migration `0047`) adds releases, holds, the pointer and the activation engine. 4c-i (migration `0048`) adds the operator commands: bootstrap, activate with rollback, and holds. 4c-ii adds the seed as a release builder (decision 6). 4d demonstrates DEBT-483's Verification on a disposable database. [DEBT-489](../_archive/debt/debt-489-release-removes-omitted-questions.md)'s fix makes every removal explicit and binds each apply to its reviewed plan. The first production bootstrap, the managed seed's switch to staging, the contract step and release zero are Deferred; the bootstrap is the owner's call, and [DEBT-490](../_archive/debt/debt-490-release-decisions-record-no-reason-or-authority.md), its recommended prerequisite, is released.
**Decision Makers:** The owner, who authorized paying down DEBT-483 and DEBT-484 on 2026-09-27. On 2026-09-28 the owner delegated open engineering decisions ("do what the best physicians and the best programmers in the world ... would do"). Under that delegation the release-zero hash form was decided as recommended; see below.
**Depends On:** ADR-003 (Testing Strategy); the content repository's SPEC-007 (Release and Withdrawal Interface, Draft) and SPEC-005 (content identity)

---

## Context

Two P1 records describe the same missing structure.

- [DEBT-484](../_archive/debt/debt-484-question-rewrite-history-identity.md): a question is one mutable row. Its stem, explanation, reference and choices are overwritten in place by the seed. An attempt stores only `question_id` and a `selected_choice_id`, so it cannot say which content the learner answered.
  - The #951 guard refuses substantive rewrites once graded history exists. It does not store revisions.
  - It does not protect a learner who is viewing an ungraded item while the seed changes it.
  - It does not make a withdrawn question reviewable, because every history read filters on `status = 'published'`.
- [DEBT-483](../_archive/debt/debt-483-content-withdrawal-and-release-rollback.md): content becomes visible question by question. The seed commits per question, and withdrawal is an explicit per-QID command. There is no release identity, no all-or-nothing activation and no rollback that respects revocations.

The content repository's SPEC-007 defines the cross-repository release interface: an immutable, hash-addressed manifest; staging and one atomic activation; explicit withdrawals and holds; a revocation overlay; rollback. It assigns *verification and activation* to the app. This record decides the app's side of that contract.

Constraints:
- Production migrations run in the Vercel build before the new deployment serves ([Migration Authoring](../dev/migration-authoring.md#deployed-code-compatibility)). Every step is therefore expand/contract, with an explicit N-1 answer.
- Attempts and session states reference choice rows through composite `(choice id, question id)` foreign keys with `ON DELETE RESTRICT`. Existing IDs must survive.

## Decision

**Phase 4 implementation boundary (2026-10-02 audit).** Decisions 4–6 describe
the target interface; #1290–#1300 implement the current command path documented
in [DEBT-483](../_archive/debt/debt-483-content-withdrawal-and-release-rollback.md).
Selection still reads materialized `questions.status` and `current_revision_id`,
not release items directly. Activation checks the caller's expected active
release and, except for a previously activated rollback target, its parent.
Since [DEBT-489](../_archive/debt/debt-489-release-removes-omitted-questions.md#fix--2026-10-02),
a new release must account for every question the active release names,
unless it is withdrawn, as an item or a named removal, and an apply is bound
to the plan its preview printed. Staging does
not move existing revision pointers and records no withdrawal; only tags
change the live bank before activation. Since [DEBT-490](../_archive/debt/debt-490-release-decisions-record-no-reason-or-authority.md),
each activation's immutable receipt records its reason and authority.
Withdrawals exclude the whole question across revisions; holds exclude one
revision. The emergency QID command writes the withdrawal and archives the
question directly, without a minimal manifest. The database triggers reject
updates to releases, items and withdrawals, but do not prohibit owner DELETE.
The [independent audit](../bugs/assets/content-release-audit-2026-10-02.md)
records reproductions, fixes and verification limits. These boundaries do not
claim SPEC-007 completion or clinical scoring-policy approval.

### 1. Content lives in immutable revisions

- A new `question_revisions` table holds everything a learner reads: `stem_md`, `explanation_md`, `reference_md` and `difficulty`, plus `canonicalization_version` and `content_hash` (in the `stored-fields-json-v1` form defined below).
- `choices` gains `question_revision_id`. A choice belongs to exactly one revision, and its label and sort-order uniqueness move from `question_id` to `question_revision_id`. `question_id` stays, because the attempt and session-state foreign keys are composite `(choice id, question id)`.
- A revision is never updated. Changed content is a new revision; the old one stays addressable. This holds from phase 2b onward; until then, revision 1 is a mirror that is refreshed (see Phasing).
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
| 1 | Expand, as a parallel change. Add `question_revisions`, `choices.question_revision_id`, `questions.current_revision_id`, and the nullable revision columns on attempts and session states. Revision 1 mirrors each question's legacy row: migration `0039` backfills it, the seed re-syncs it after every write, and the re-runnable `sweep_question_revisions_v1()` repairs rows any other writer changed. | Serving code ignores the new columns. The history-table keys are added `NOT VALID`, so N-1 writes of NULL pass, and legacy content that N-1 code changes is repaired by the sweep. |
| 2a | Readers switch, with one revision still per question. Selection, grading and every review read resolve content and choices through a revision: the session state's or attempt's bound revision, else the question's current one. Sessions bind each item's revision at creation and attempts bind the revision they graded; the `(choice, revision)` unique key and composite foreign keys land here. The seed refreshes revision 1 only while no incomplete session binds it; the #951 guard still governs graded history, so a correction waits for active sessions to end rather than changing content under them (#1177 review). A bounded, batched job binds every older session state and attempt to its question's revision 1. Add the withdrawal notice for attempted withdrawn questions. The migration re-runs the sweep first. | Old code still reads the legacy columns and choices by `question_id`, which is correct while every question has exactly one revision. |
| 2b | Writers become append-only, in a later deploy than 2a. The migration first verifies that no session state or attempt is unbound, and fails loudly if any is, so no older row can later resolve to a newer revision (#1177 review). A content change is then a new revision with its own choice rows, per-revision label and sort-order keys replace the per-question ones, and a trigger rejects every update to a revision. | N-1 is phase 2a, whose readers already use revisions and bind every new row. The seed refuses to append a revision until the 2b migration has committed, so no legacy reader can meet two revisions' choices (#1177 review). |
| 3 | Contract: `NOT NULL` revision columns after a verified sweep; drop the legacy text columns from `questions`. | Only after N-1 code that reads legacy columns can no longer serve. |
| 4 | Releases, staging, atomic activation, the withdrawal and hold overlay, and rollback. Selection reads the active release. | The legacy `status` stays in step until the release pointer is authoritative. |
| 5 | Release zero, the inventory of what is live, hashed in `stored-fields-json-v1`. | Read-only export. |

### Phase 2b order: the update notice before appending (2026-09-30)

Once the seed appends, an answer-key correction is a new revision, and a review shows the revision the learner answered. Without a notice, that review would present a superseded key as correct. So phase 2b first adds an update notice to reviews of an answered revision that is no longer current, following the erratum practice beside §3's retraction practice. It then adds the same notice to an active session's items, since a session keeps its bound revision. Only then does a PR make the writers append-only; migration `0042` did so on 2026-09-30. Scoring is unchanged: an attempt keeps its grade. The plan and its receipts are in [DEBT-484](../_archive/debt/debt-484-question-rewrite-history-identity.md#phase-2b-plan-decided-2026-09-30).

### Why phase 1 mirrors instead of appending (2026-09-28)

Phase 1 was first written as "the seed writes a new revision for changed content". That cannot be done safely before the readers switch (phase 2a), because the serving code reads a question's choices by `question_id` and choices are unique per `(question_id, label)`. There are three options, and only one is sound:
- **Append in phase 1.** A second revision's choice rows would either collide with the per-question keys or, once those keys move, show a question with both revisions' choices. Re-keying choices early would also detach in-progress drafts and key-corrected attempts from the text they refer to, until phase 2 binds them.
- **Freeze content rewrites until phase 2.** This would block the explicit answer-key correction the #951 guard keeps for medical errors, and that path must stay open.
- **Mirror (chosen).** This is Fowler's parallel change. The new structure is written beside the old one and kept faithful to it, readers are unchanged, and the switch to revision reads and then append-only writes happens in phases 2a and 2b. Nothing a learner sees changes. After every seed write and every sweep, the stored hash states exactly what content is live. A change made by another writer, such as an N-1 seed during a deploy overlap, stays stale until the next sweep. So the phase 2a migration re-runs the sweep before any reader depends on revisions (#1177 review).

## Release-zero content hash: `stored-fields-json-v1` (decided 2026-09-28)

SPEC-007 asks the app to export each live question "in the form SPEC-005 hashes", which is `parsed-block-json-v1`. That form is SHA-256 over sorted-key JSON of `{metadata, body}` as the content repository's `scripts/content_io.py` parses a **draft block**.

The app stores parsed fields after two transformations, draft → MDX → rows, and does not retain the draft's YAML and Markdown layout. A draft-form export rebuilt from stored fields would make every whitespace or ordering normalization look like content drift.

**Decision.** Both repositories hash a second canonical form, `stored-fields-json-v1`, built from exactly the fields the app stores and renders. The content repository computes it from each parsed block through the importer's own mapping; the app computes it from rows. Release zero then compares like with like, and a true discrepancy, such as a live body edited after import, is still caught. Hashing a lossy reconstruction would instead report false drift, which trains everyone to ignore the check.

**Definition.**
- The value is a JSON object with the keys `stem_md`, `explanation_md`, `reference_md` (string or `null`), `difficulty` (`easy`, `medium` or `hard`) and `choices`.
- `choices` is an array ordered by `sort_order` ascending. Each element has the keys `label`, `sort_order` (integer), `text_md`, `is_correct` (boolean) and `explanation_md` (string or `null`).
- Keys are sorted at every level, there is no insignificant whitespace, and strings are escaped as ECMAScript's `JSON.stringify` escapes them. The text is encoded as UTF-8 and hashed with SHA-256, written as lowercase hex.
- The form is byte-identical to Python's `json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`, so the content repository can compute it in one line.
- Row identities (question, revision and choice ids), the slug, the status and taxonomy are not content and are left out.

**Reference implementation.** `lib/content/question-revision-hash.ts` is the app's implementation. Its tests pin the canonical text and digests of two vectors computed independently with Python's standard library, one of them with quotes, backslashes, control characters, a line separator, non-ASCII text and an emoji. Phase 1's backfill must produce the same bytes, and must prove it against this implementation.

**Follow-up outside this repository.** The content repository's SPEC-005 and SPEC-007 must adopt `stored-fields-json-v1` for release zero before phase 5 can run. The app does not edit that repository.

## Consequences

- DEBT-484 closes after phases 1–3: rewrites become revisions, history and sessions bind them, and withdrawn questions are reviewable with a notice.
- DEBT-483 closes after phase 4. Release zero follows once the content repository computes `stored-fields-json-v1` too.
- Every history read path changes in phase 2a. Each gains a real-Postgres case, and the existing unavailable-row UI becomes the withdrawal-notice UI.
- Revisit this record if SPEC-007's manifest fields change, or if the content repository cannot adopt `stored-fields-json-v1`.

## Related

- [DEBT-483](../_archive/debt/debt-483-content-withdrawal-and-release-rollback.md), [DEBT-484](../_archive/debt/debt-484-question-rewrite-history-identity.md)
- [Migration Authoring](../dev/migration-authoring.md)
- Content repository: SPEC-005, SPEC-007, ADR-001 (repository boundary)
