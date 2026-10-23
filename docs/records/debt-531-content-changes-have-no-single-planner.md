# DEBT-531: Content Changes Have No Single Planner, So the Two Writers Judge the Same File Differently

**Status:** Verifying — every check is recorded, and the record closes; due 2026-10-21
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Corrected 2026-10-19: revision-level activation holds and question-level clinical caution can coexist; the fix preserves both and adds direct named lifts. BUG-351 part 2 has built the return guard.

Two programs write question content, and they apply different rules to the same file.

- **The release builder** refuses a bundle that moves a question back to an earlier revision, unless `--revert` names it (DEBT-492).
- **The direct seed** compares a file only with the current revision. Different content becomes a new current revision; it is live only when its question is published.

The last recorded production state in DEBT-483 is unbootstrapped, with direct seeding still available; the current release pointer was not queried. The managed production seed imports the local untracked drafts folder, which can lag the source. Bare seeding reads the existing MDX output instead.

The live defect this split causes is BUG-351: a stale seed restores a corrected answer key with no warning. BUG-351 part 2 now catches the release builder's missed return case; source admission remains there. BUG-351 owns the shared planner and measures the exposure. This record keeps the rest of the split. BUG-351 part 1 aligns whole-revision comparison at the seed and builder. Score eligibility compares a narrower key projection and now shares the seed's text normalization. The hold amendments make their distinct activation and availability scopes explicit.

## Evidence

**The two revert rules:**
- Builder: `scripts/content-release/release-builder.ts:61-97` matches a file against every revision of its question. `:307-321` refuses a move to an earlier revision without `--revert`.
- Seed: `scripts/seed/question-syncer.ts:256-267` compares the canonical file with the current revision only, and appends a revision when they differ. BUG-281's graded-history refusal went when revisions became append-only (`3ac01fc8`, 2026-09-30).
- The production path:
  - `db:seed:prod` (`scripts/seed-production.ts`) prepares the corpus from `content/drafts/questions` (`scripts/import-draft-questions.ts:20`) with `--status published` (`scripts/prepare-seed-corpus.ts:24`), then seeds production (`scripts/seed-environment-targets.ts:105-106`).
  - The drafts' question folders are untracked (`.gitignore:63-66`).
- `release-activation.ts:103-111`: the seed may write whenever no release is active.

**Whole-revision equality and answer-key projection have different purposes and formerly inconsistent normalization:**
- The seed canonicalizes both sides before comparing (`scripts/seed/question-parser.ts:158-181`; guarded by `tests/integration/seed-revision-append.integration.test.ts:149-188`).
- Before BUG-351 part 1, the builder compared the stored `content_hash` (`release-builder.ts:62-76` at `92e56929`). It now recomputes canonical fields with the seed's `revisionFieldsFromDb`. That hash covers the stored bytes, which may not be canonical; migration `0039` hashed the legacy columns as they were for every first revision. `a622027e` (2026-10-01) moved the builder off the seed's canonical comparison.
- Before this part, answer-key correction compared the raw label and text. It now compares exact labels and normalized text (`src/domain/services/answer-key.ts:10-15` and its SQL twin, `src/adapters/repositories/shared/score-eligibility-sql.ts:96-110`). The seed reuses `src/domain/value-objects/markdown-normalization.ts`; stored revision hashes still cover stored bytes.

The consequences need distinct preconditions:
- Before BUG-351 part 1, the builder could append a revision for canonical input equal in meaning to a noncanonical stored revision **if no stored raw hash matches it**. A canonical duplicate elsewhere in history could instead be reused. Part 1 compares canonical fields and prefers the current revision.
- Before this part, an append that changed correct-choice text only by normalization marked older answers corrected. Whitespace only in the stem did not do that. This could occur before bootstrap if another substantive seed edit appended canonical choices from a legacy revision. The amended ADR-022 comparison keeps those answers scored.
- Whole-content identity must not be collapsed into the key projection: a stem-only edit can change the revision without changing its key. Reusing normalization is a separate decision from merging those meanings.

BUG-351 owns the duplicate-hash `.limit(1)` defect and deterministic current-match preference. This record owns key normalization for scoring. ADR-022 Decision 4 now names the seed's existing normalization, with a pure domain normalizer and matching SQL. Domain code does not import `lib/content`.

Production prevalence is unknown. The read-only census in `scripts/content-release/census-normalization.ts` separately counts the five noncanonical Markdown field types and correct-choice text changes. A local run counted 958 revisions and 3,832 choices, with zero noncanonical fields. This is not a production census or evidence about clinical errors. Stored bytes and hashes remain immutable.

**A hold has two scopes:**
- Activation treats a hold as excluding one revision (`release-changes.ts:30-34`; ADR-021 decision 5).
- Availability and scoring treat a hold on any revision of a question as "under review" once the question is not published (`drizzle-question-repository.ts:403-413`; `score-eligibility-sql.ts:28-32`; `question-availability.ts:42-49`).
- Before this fix, a lift reached only the revision the active release named (`release-holds.ts:60-98` at `9920ed9c`). A hold on R1 could not be lifted directly while R2 was active or the question was omitted. DEBT-492 gap 3 noted that dormant hold and left it.
- A named hold can now be lifted directly under the release-pointer lock; `--qid` retains its live-revision scope (`release-holds.ts`; `hold-questions.ts`). The same activation and key-return guards apply.
- ADR-021 decision 5 excludes the held revision from activation. ADR-022 Decision 1 keeps an unpublished question Under review while any hold remains. Publishing a replacement does not lift an old hold; later retirement still carries its clinical caution and score exclusion until review ends. Both dated amendments make that relationship explicit. Holds still need an active release.

**Smaller items:**
- Tags change in place outside the release manifest, its review plan and rollback (`release-builder.ts:370-390`; `release-manifest.ts`). This accepted implementation limit is already documented in ADR-021's implementation boundary and `docs/architecture/content-pipeline.md:361,370`: staging changes tags immediately, and rollback does not restore them. Changing it requires an explicit ADR-021 amendment; it is not an undocumented defect.
- Feedback records `question_id`, an optional `attempt_id` and an optional `practice_session_id`, but no revision (`db/schema.ts:1340-1361`). A report with neither an attempt nor a session cannot say which revision it concerned.
- Question status, tag kind and the slug pattern are each retyped in several places (`db/schema.ts`, the domain value objects, `lib/content/schemas.ts`, `scripts/draft-question-import.ts`). They agree today; DEBT-453 consolidated only difficulty.

**History:**
- BUG-281 and DEBT-484: rewrites under graded history.
- DEBT-486: validation disagreement. DEBT-487: frontmatter-order splitting omitted content. DEBT-489: release removal by omission.
- DEBT-492: revert protection scoped to release staging; direct-seed freshness remained outside that fix. Its “none is live” judgment concerned release-only gaps before bootstrap.
- BUG-314: content writers had no shared lock order.
- DEBT-494: scores changing with content.

## Impact

The answer-key harm is BUG-351's, at P2. What remains here is latent:
- The built normalization changes prevent needless revisions and false key corrections under the preconditions above. The former key-comparison effect was not restricted to post-bootstrap databases; production prevalence remains unverified.
- An unresolved hold keeps a retired question "Under review" and out of scores. The direct named lift lets the operator end that review without rolling back content.

P3.

## Options

1. **Shared normalization with distinct semantic comparisons.** BUG-351 owns the planner, including deterministic current-match preference. Whole-revision equality and ADR-022's key-only comparison remain distinct. Decide normalization for each field, amend ADR-022 if score eligibility changes, and test the domain/SQL counterparts. *Selected:* bootstrap alone would not align the scoring comparison. BUG-351 part 2 now guards the earlier-key return the builder previously accepted.
2. **Bootstrap releases in production (DEBT-483).** The seed then refuses production, and the builder's rules become the only path. Run the canonical-hash check first. The decision and its timing are the owner's. Bootstrap after BUG-351's planner, so the remaining writer has its rule.

For holds, preserve revision-level activation exclusion and question-level clinical caution. The ADR-021/022 amendments state when each applies. A direct lift names the hold ID, so it cannot clear another review of the same revision.

## Resolution

BUG-351 owns the shared planner and source admission. This record owns normalization and hold semantics, with their explicit ADR-021/022 amendments. DEBT-483 alone owns bootstrap timing, the managed seed's transition and release zero; its owner check comes first.

The normalization part shares the seed's pure Markdown normalizer with the domain key comparison and gives the aggregate SQL reader an equivalent. Real Postgres cases exercise all 25 JavaScript edge-whitespace characters, line endings, trailing spaces and tabs, and significant interior changes. Shared fake-to-real contracts cover question reads, dashboard scores and tutor/exam history. Historical revision rows remain unchanged. The counts-only census runs in a read-only transaction; its integration test verifies that all stored fields and hashes stay unchanged. It distinguishes optional null, empty and whitespace-only fields. The SQL normalizer is shared with the score reader.

A direct `--lift --hold` operation names one or more stable hold IDs. It rejects unknown IDs and mixed selectors, records the reason and authority, and reapplies the active release under the pointer lock. An old hold can be lifted after replacement or retirement. A replay never lifts a later hold on that revision. Tests cover retirement, rollback, another remaining hold, an unknown ID, and atomic refusal of an unnamed answer-key return. Hold lifting does not change the availability or scoring predicates.

DEBT-446's former Part 3b scope belongs to BUG-351. Its premise, that the seed refused key changes under graded history, went with `3ac01fc8`. DEBT-524's closed content discussion cited DEBT-483; it did not assign bootstrap ownership here.

Feedback without attempt/session context cannot identify the reported revision, and vocabulary definitions remain repeated. These inspected facts are preserved as follow-up candidates, not additional acceptance requirements or evidence that all copies currently disagree. Any independently confirmed defect needs its own bounded owner.

## Verification

- [x] The seed, builder and key projection share the agreed normalization while keeping their comparisons distinct; SQL/domain score cases agree under the amended ADR-022. BUG-351 retains the remaining planner work.
- [x] A read-only census counts noncanonical fields without changing stored bytes or hashes. Approved content changes append revisions; historical rows are never rewritten to satisfy canonical comparison.
- [x] ADR-021/022 explicitly define hold scope across activation, availability and scoring; a named old hold can be lifted directly, with retirement/rollback cases tested.

- [x] Promoted to `main` by #1580 (`f1401984`) on 2026-10-20, which carries #1575 (`f1cc5250`). Recorded 2026-10-23, two days late.

## Related

- BUG-351: the live defect, its reproduction and the planner's design.
- DEBT-483 (Waiting): the production content bootstrap.
- DEBT-446 (closed): the parked freshness check, whose Part 3b scope BUG-351 takes.
- DEBT-524 (closed): Finding 1's view of the content transition, whose operational owner remains DEBT-483.
- DEBT-492, BUG-281, BUG-314 (closed).
