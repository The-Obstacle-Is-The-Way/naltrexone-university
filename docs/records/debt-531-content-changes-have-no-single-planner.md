# DEBT-531: Content Changes Have No Single Planner, So the Two Writers Judge the Same File Differently

**Status:** In Progress — key normalization built; the read-only census and hold scope remain, due 2026-10-21; BUG-351 owns the planner, DEBT-483 bootstrap timing
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Two programs write question content, and they apply different rules to the same file.

- **The release builder** refuses a bundle that moves a question back to an earlier revision, unless `--revert` names it (DEBT-492).
- **The direct seed** compares a file only with the current revision. Different content becomes a new current revision; it is live only when its question is published.

The last recorded production state in DEBT-483 is unbootstrapped, with direct seeding still available; the current release pointer was not queried. The managed production seed imports the local untracked drafts folder, which can lag the source. Bare seeding reads the existing MDX output instead.

The live defect this split causes is BUG-351: a stale seed restores a corrected answer key with no warning, and the builder's own guard misses part of that case. BUG-351 reproduces it, measures today's exposure and designs the fix: one content-change planner that both writers call. This record keeps the rest of the split. BUG-351 part 1 aligns whole-revision comparison at the seed and builder. Score eligibility compares a narrower key projection and now shares the seed's text normalization. Hold scope still differs between activation and availability.

## Evidence

**The two revert rules:**
- Builder: `scripts/content-release/release-builder.ts:58-94` matches a file against every revision of its question. `:270-284` refuses a move to an earlier revision without `--revert`.
- Seed: `scripts/seed/question-syncer.ts:256-267` compares the canonical file with the current revision only, and appends a revision when they differ. BUG-281's graded-history refusal went when revisions became append-only (`3ac01fc8`, 2026-09-30).
- The production path:
  - `db:seed:prod` (`scripts/seed-production.ts`) prepares the corpus from `content/drafts/questions` (`scripts/import-draft-questions.ts:20`) with `--status published` (`scripts/prepare-seed-corpus.ts:24`), then seeds production (`scripts/seed-environment-targets.ts:105-106`).
  - The drafts' question folders are untracked (`.gitignore:63-66`).
- `release-activation.ts:127-134`: the seed may write whenever no release is active.

**Whole-revision equality and answer-key projection have different purposes and inconsistent normalization:**
- The seed canonicalizes both sides before comparing (`scripts/seed/question-parser.ts:158-181`; guarded by `tests/integration/seed-revision-append.integration.test.ts:149-188`).
- Before BUG-351 part 1, the builder compared the stored `content_hash` (`release-builder.ts:62-76` at `92e56929`). It now recomputes canonical fields with the seed's `revisionFieldsFromDb`. That hash covers the stored bytes, which may not be canonical; migration `0039` hashed the legacy columns as they were for every first revision. `a622027e` (2026-10-01) moved the builder off the seed's canonical comparison.
- Before this part, answer-key correction compared the raw label and text. It now compares exact labels and normalized text (`src/domain/services/answer-key.ts:10-15` and its SQL twin, `src/adapters/repositories/shared/score-eligibility-sql.ts:96-110`). The seed reuses `src/domain/value-objects/markdown-normalization.ts`; stored revision hashes still cover stored bytes.

The consequences need distinct preconditions:
- Before BUG-351 part 1, the builder could append a revision for canonical input equal in meaning to a noncanonical stored revision **if no stored raw hash matches it**. A canonical duplicate elsewhere in history could instead be reused. Part 1 compares canonical fields and prefers the current revision.
- Before this part, an append that changed correct-choice text only by normalization marked older answers corrected. Whitespace only in the stem did not do that. This could occur before bootstrap if another substantive seed edit appended canonical choices from a legacy revision. The amended ADR-022 comparison keeps those answers scored.
- Whole-content identity must not be collapsed into the key projection: a stem-only edit can change the revision without changing its key. Reusing normalization is a separate decision from merging those meanings.

BUG-351 owns the duplicate-hash `.limit(1)` defect and deterministic current-match preference. This record owns key normalization for scoring. ADR-022 Decision 4 now names the seed's existing normalization, with a pure domain normalizer and matching SQL. Domain code does not import `lib/content`.

Production prevalence is unknown. A read-only census should separately count noncanonical revision fields and correct-choice normalization changes; neither count alone establishes a clinical error. Stored bytes/hashes remain immutable.

**A hold's scope has two owners:**
- Activation treats a hold as excluding one revision (`release-activation.ts:99-104`; ADR-021 decision 5).
- Availability and scoring treat a hold on any revision of a question as "under review" once the question is not published (`drizzle-question-repository.ts:403-413`; `score-eligibility-sql.ts:28-32`; `question-availability.ts:42-49`).
- A lift reaches only the revision the active release publishes (`release-holds.ts:59-97`).
- So a hold on R1, after a release publishes R2, cannot be lifted directly while another revision is active, or while the active release omits the question. Reactivating a release that names R1 makes it liftable, a disruptive workaround documented in `docs/architecture/content-pipeline.md:373`. If the question is later retired, that forgotten hold labels it "Under review" and drops past scores on it. DEBT-492 gap 3 noted the dormant hold and left it.
- The two readings come from two decisions: ADR-021 decision 5 (per revision) and ADR-022 Decision 1 ("an unlifted hold on a revision of the question"). Choosing one amends the other. The gap is dormant until the bootstrap, since holds need an active release.

**Smaller items:**
- Tags change in place outside the release manifest, its review plan and rollback (`release-builder.ts:339-359`; `release-manifest.ts`). This accepted implementation limit is already documented in ADR-021's implementation boundary and `docs/architecture/content-pipeline.md:357,365`: staging changes tags immediately, and rollback does not restore them. Changing it requires an explicit ADR-021 amendment; it is not an undocumented defect.
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
- A forgotten hold can label a retired question "Under review" and drop past scores on it.

P3.

## Options

1. **Shared normalization with distinct semantic comparisons.** BUG-351 owns the planner, including deterministic current-match preference. Whole-revision equality and ADR-022's key-only comparison remain distinct. Decide normalization for each field, amend ADR-022 if score eligibility changes, and test the domain/SQL counterparts. *Recommended:* the bootstrap alone does not remove the split, because the builder still accepts BUG-351 step 8.
2. **Bootstrap releases in production (DEBT-483).** The seed then refuses production, and the builder's rules become the only path. Run the canonical-hash check first. The decision and its timing are the owner's. Bootstrap after BUG-351's planner, so the remaining writer has its rule.

For holds, choose and document a coherent relationship between revision-level activation exclusion and question-level availability. This is an ADR-021/022 decision, not a mechanical deduplication. Preserve the clinical caution and score effects in the selected policy, and allow a direct lift of a named held revision without rolling the release back.

## Resolution (normalization built; remainder proposed)

BUG-351 owns the shared planner and source admission. This record owns normalization and hold semantics, with their explicit ADR-021/022 amendments. DEBT-483 alone owns bootstrap timing, the managed seed's transition and release zero; its owner check comes first.

The normalization part shares the seed's pure Markdown normalizer with the domain key comparison and gives the aggregate SQL reader an equivalent. Real Postgres cases exercise all 25 JavaScript edge-whitespace characters, line endings, trailing spaces and tabs, and significant interior changes. Shared fake-to-real contracts cover question reads, dashboard scores and tutor/exam history. Historical revision rows remain unchanged. The census and hold policy are next, due 2026-10-21.

DEBT-446's former Part 3b scope belongs to BUG-351. Its premise, that the seed refused key changes under graded history, went with `3ac01fc8`. DEBT-524's closed content discussion cited DEBT-483; it did not assign bootstrap ownership here.

Feedback without attempt/session context cannot identify the reported revision, and vocabulary definitions remain repeated. These inspected facts are preserved as follow-up candidates, not additional acceptance requirements or evidence that all copies currently disagree. Any independently confirmed defect needs its own bounded owner.

## Verification

- [x] The seed, builder and key projection share the agreed normalization while keeping their comparisons distinct; SQL/domain score cases agree under the amended ADR-022. BUG-351 retains the remaining planner work.
- [ ] A read-only census counts noncanonical fields without changing stored bytes or hashes. Approved content changes append revisions; historical rows are never rewritten to satisfy canonical comparison.
- [ ] ADR-021/022 explicitly define hold scope across activation, availability and scoring; a named old hold can be lifted directly, with retirement/rollback cases tested.

## Related

- BUG-351: the live defect, its reproduction and the planner's design.
- DEBT-483 (Waiting): the production content bootstrap.
- DEBT-446 (closed): the parked freshness check, whose Part 3b scope BUG-351 takes.
- DEBT-524 (closed): Finding 1's view of the content transition, whose operational owner remains DEBT-483.
- DEBT-492, BUG-281, BUG-314 (closed).
