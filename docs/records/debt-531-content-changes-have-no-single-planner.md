# DEBT-531: Content Changes Have No Single Planner, So the Two Writers Judge the Same File Differently

**Status:** Open — BUG-351's content-change planner is the first piece; then one definition of same content and one hold scope; the owner decides the bootstrap (DEBT-483)
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Two programs write question content, and they apply different rules to the same file.

- **The release builder** refuses a bundle that moves a question back to an earlier revision, unless `--revert` names it (DEBT-492).
- **The direct seed** compares a file only with the current revision. Different content becomes a new revision and goes live at once.

Production content still goes through the direct seed: no release is active (DEBT-483). Its input is each clone's local, untracked drafts folder, which can be an older snapshot than the content repository.

The live defect this split causes is BUG-351: a stale seed restores a corrected answer key with no warning, and the builder's own guard misses part of that case. BUG-351 reproduces it, measures today's exposure and designs the fix: one content-change planner that both writers call. This record keeps the rest of the split. "Same content" has three definitions, and a hold's scope has two owners.

## Evidence

**The two revert rules:**
- Builder: `scripts/content-release/release-builder.ts:57-78` matches a file against every revision of its question. `:254-268` refuses a move to an earlier revision without `--revert`.
- Seed: `scripts/seed/question-syncer.ts:256-267` compares the canonical file with the current revision only, and appends a revision when they differ. BUG-281's graded-history refusal went when revisions became append-only (`3ac01fc8`, 2026-09-30).
- The production path:
  - `db:seed:prod` (`scripts/seed-production.ts`) prepares the corpus from `content/drafts/questions` (`scripts/import-draft-questions.ts:20`) with `--status published` (`scripts/prepare-seed-corpus.ts:24`), then seeds production (`scripts/seed-environment-targets.ts:105-106`).
  - The drafts' question folders are untracked (`.gitignore:63-66`).
- `release-activation.ts:127-134`: the seed may write whenever no release is active.

**"Same content" is defined three ways:**
- The seed canonicalizes both sides before comparing (`scripts/seed/question-parser.ts:158-181`; guarded by `tests/integration/seed-revision-append.integration.test.ts:149-188`).
- The builder compares the stored `content_hash` (`release-builder.ts:62-76`). That hash covers the stored bytes, which may not be canonical; migration `0039` hashed the legacy columns as they were for every first revision. `a622027e` (2026-10-01) moved the builder off the seed's canonical comparison.
- Answer-key correction compares the raw label and text (`src/domain/services/answer-key.ts:8-15` and its SQL twin, `src/adapters/repositories/shared/score-eligibility-sql.ts:104-108`).

So, after bootstrap, any stored revision that is not canonical has two effects:
- A bundle with no real change stages a new revision.
- A whitespace-only difference in the correct choice marks past attempts "answer corrected".

Separately, `revisionForContent` takes `.limit(1)` with no order, and nothing makes `(question, content_hash)` unique (`db/schema.ts`). BUG-351 reproduced the result: after an A→B→A→B history, the builder refuses the live content as a revert.

Whether production holds such rows is unverified. One read-only query recomputing canonical hashes would settle it.

**A hold's scope has two owners:**
- Activation treats a hold as excluding one revision (`release-activation.ts:99-104`; ADR-021 decision 5).
- Availability and scoring treat a hold on any revision of a question as "under review" once the question is not published (`drizzle-question-repository.ts:403-413`; `score-eligibility-sql.ts:28-32`; `question-availability.ts:42-49`).
- A lift reaches only the revision the active release publishes (`release-holds.ts:59-97`).
- So a hold on R1, after a release publishes R2, can no longer be lifted with the tools. If the question is later retired, that forgotten hold labels it "Under review" and drops past scores on it. DEBT-492 gap 3 noted the dormant hold and left it.
- The two readings come from two decisions: ADR-021 decision 5 (per revision) and ADR-022 Decision 1 ("an unlifted hold on a revision of the question"). Choosing one amends the other. The gap is dormant until the bootstrap, since holds need an active release.

**Smaller items:**
- Tags change in place outside the release manifest, its review plan and rollback (`release-builder.ts:323-343`; `release-manifest.ts`). ADR-021 decision 1 chose this; the consequences are not written down.
- Feedback records `question_id`, an optional `attempt_id` and an optional `practice_session_id`, but no revision (`db/schema.ts:1340-1361`). A report with neither an attempt nor a session cannot say which revision it concerned.
- Question status, tag kind and the slug pattern are each retyped in several places (`db/schema.ts`, the domain value objects, `lib/content/schemas.ts`, `scripts/draft-question-import.ts`). They agree today; DEBT-453 consolidated only difficulty.

**History:**
- BUG-281 and DEBT-484: rewrites under graded history.
- DEBT-486, DEBT-487 and DEBT-489: the importer and the seed disagreeing.
- DEBT-492: the builder's revert refusal, with a "none is live" judgment that missed the seed.
- BUG-314: content writers had no shared lock order.
- DEBT-494: scores changing with content.

## Impact

The answer-key harm is BUG-351's, at P2. What remains here is latent:
- After the bootstrap, a non-canonical stored revision makes a bundle with no real change stage a new revision, and makes a whitespace-only difference mark past attempts "answer corrected".
- A forgotten hold can label a retired question "Under review" and drop past scores on it.

P3.

## Options

1. **One content planner** used by both writers. BUG-351's fix builds it for reverts and answer-key regressions, with canonical comparison and a deterministic match. Extend it to the remaining definitions of "same content". *Recommended:* the bootstrap alone does not remove the split, because the builder keeps its own gaps (BUG-351 steps 6 and 8).
2. **Bootstrap releases in production (DEBT-483).** The seed then refuses production, and the builder's rules become the only path. Run the canonical-hash check first. The decision and its timing are the owner's. Bootstrap after BUG-351's planner, so the remaining writer has its rule.

For holds, choose per-revision or per-question scope everywhere, amending the ADR that loses, and let a lift reach any revision.

## Resolution (proposed)

BUG-351's fix first: it is this record's planner, red first on its reproduction. Then the owner decides the bootstrap's timing, and the canonical-hash query runs before it.

DEBT-446's Waiting row (Part 3b) leaves Waiting in this change. Its freshness gap is BUG-351's live defect, which BUG-351's provenance check and planner close. Its trigger had not strictly fired: the release builder is a second writer, but the pointer lock orders it. The reasons to act now are new: ADR-022 made a window's answers stay out of scores, and BUG-351 showed that the builder's own rule is partial. DEBT-524's Finding 1 judged the two-writer period covered by DEBT-483, and DEBT-524 closed on 2026-10-17 without placing the content transition in a live record. This record owns it: the rules that differ between the two writers, and the point where the seed stops writing production.

## Verification

- [ ] Both writers plan through one module (BUG-351), and it decides "same content" one way.
- [ ] A read-only query shows every stored revision's hash equals its canonical hash, or the mismatches are rewritten before bootstrap.
- [ ] A hold has one scope in activation, availability and scoring, and any hold can be lifted.

## Related

- BUG-351: the live defect, its reproduction and the planner's design.
- DEBT-483 (Waiting): the production content bootstrap.
- DEBT-446 (closed; its Waiting row left with this record): the seed's missing freshness check, now BUG-351's defect.
- DEBT-524 (closed): Finding 1's view of the content transition, which this record now owns.
- DEBT-492, BUG-281, BUG-314 (closed).
