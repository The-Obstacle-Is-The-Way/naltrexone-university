# BUG-281: Seed Re-Import Silently Rewrites `choices.is_correct` Under Graded History, Making Stored Grades Contradict the Displayed Answer Key

**Status:** Open
**Severity:** P3
**Date:** 2026-07-05
**Confirmed:** 2026-07-05
**Re-verified:** 2026-07-08 against `origin/dev`; still live at branch start, owner selected BLOCK for implementation
**Component:** Content Pipeline / Seed / Review Integrity

---

## Summary

The seed syncer's delete path carefully refuses to remove choices referenced by attempts or practice-session state rows (the BUG-266 guard), but its **upsert** path has no equivalent guard: `onConflictDoUpdate` on `(question_id, label)` unconditionally rewrites `text_md`, `is_correct`, `explanation_md`, and `sort_order` — including flipping `is_correct` on choices that graded history references.

Stored grades (`attempts.is_correct`, `practice_session_question_states.latest_is_correct`) were computed against the answer key at submission time and are never regraded. But the completed-session/post-exam review path recomputes the "correct answer" highlight from **current** content. After a key-changing re-import, the two sources contradict each other on screen: a user who answered B when B was correct sees a "Correct" result badge next to a review that highlights C as the correct answer and renders their B as wrong.

The trigger is exactly the well-intentioned case: a content editor fixing a miskeyed question — the moment the fix lands, every prior answer of that question displays contradictory grading.

## Reachability

Requires a content re-import (`db:seed` / the question-syncer pipeline) that changes `is_correct` on an existing choice for a question with graded history. Content-fix imports are routine; whether any has yet flipped a key under live history is unknown — the defect is in the pipeline, and nothing prevents or even logs the occurrence.

The only live answer-key writer found in repo code is the seed syncer:

- [`question-syncer.ts`](../../scripts/seed/question-syncer.ts#L108-L117) inserts choices for new questions.
- [`question-syncer.ts`](../../scripts/seed/question-syncer.ts#L268-L287) upserts existing choices and currently rewrites `isCorrect` unconditionally.
- Runtime answer paths write graded history (`attempts.is_correct` and `practice_session_question_states.latest_is_correct`) but do not mutate `choices.is_correct`.

Operational audit:

- CI migrates, then seeds a fresh service DB, then runs tests ([`ci.yml`](../../.github/workflows/ci.yml#L105-L117)). No attempts or practice-session state rows exist before seed in the normal CI order, so the BLOCK guard cannot trip there.
- Hermetic local E2E creates/migrates/seeds its isolated Docker DB before Playwright runs ([`e2e-local-orchestrator.ts`](../../scripts/e2e-local-orchestrator.ts#L75-L93)). It therefore cannot trip during baseline seed; later specs may create attempts/state, but they do not reseed inside the same run.
- Long-lived local DBs and manual shared-environment content imports can legitimately reseed over historical attempts/state. Because imported content is gitignored and clone-specific, this is the practical place the guard can trip. The escape hatch is an explicit env var, not silent default behavior.
- Production deploys run migrations and build only (`"pnpm db:migrate && pnpm build"` in [`vercel.json`](../../vercel.json#L1-L4)); content seed remains manual (`db:seed` / `db:seed:all`) and is not part of deploy.

## Reproduction

1. User answers question Q selecting choice B; B is keyed correct → attempt stored with `is_correct = true`.
2. Editor fixes Q's key in the content files (B→incorrect, C→correct) and runs the seed import.
3. User opens the completed session's review (post-exam review or completed-session review).

Expected: a deliberate, decided behavior — either grades are versioned/regraded, or the UI explains that content changed since the attempt.

Actual: the result badge says "Correct" (stored grade) while the recomputed key highlights C and shows the user's B styled as a wrong answer, with no explanation. Session scores keep the old grading; per-question displays show the new key.

## Root Cause

- [`question-syncer.ts`](../../scripts/seed/question-syncer.ts#L268-L287): the choice upsert's `onConflictDoUpdate` sets `isCorrect: choice.is_correct` with no check against existing attempt/state references — asymmetric with the same file's delete path, which does check ([`question-syncer.ts`](../../scripts/seed/question-syncer.ts#L194-L254)).
- Completed-session/post-exam review dual-sources correctness: stored grade for the badge, recomputed key for the highlight — [`get-completed-session-questions-with-feedback.ts`](../../src/application/use-cases/get-completed-session-questions-with-feedback.ts#L141-L152) reads the stored attempt/state grade, while [`get-completed-session-questions-with-feedback.ts`](../../src/application/use-cases/get-completed-session-questions-with-feedback.ts#L164-L195) derives the correct choice from the current `Question` choices.

Neither half is individually wrong; the system simply has no answer-key versioning and no policy for key changes under history.

## Impact

Users see self-contradictory grading on a medical-education product — trust-destroying on exactly the questions that needed a content fix (i.e., where the editor knows users were graded against a wrong key). No crash, no data loss, and it requires a key-changing import, so P3 — but this needs a **product decision**, not just code: regrade, version, block, or disclose.

## Proposed Fix

Owner ruling: **BLOCK**.

Extend the existing seed delete-path reference guard instead of adding a parallel policy. The seed importer must refuse to change `choices.is_correct` in place when graded history exists for the question, unless an explicit override is set.

Contract:

- **Graded history:** count `attempts` rows for the question and `practice_session_question_states` rows for the question with `latest_is_correct IS NOT NULL`. Draft-only state and other ungraded state do not count; finalize grades against the current key at finalize time, and blocking draft-only correction would protect no historical score.
- **Trip condition:** only an `is_correct` change on an existing `(question_id, label)` choice trips the guard. Text, explanation, ordering, tags, question stem, difficulty, status, new choices, and unreferenced key flips remain importable.
- **Failure shape:** fail fast using the existing `syncQuestionsFromFiles()` per-file wrapper, so the final thrown error includes the question slug and absolute file path. The inner guard message must name the question slug, flipped labels, and graded row counts.
- **Batch semantics:** unchanged. `syncQuestionsFromFiles()` processes files sequentially and stops on the first failure; later files are untouched.
- **Override:** `SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY=true` permits the flip and logs loudly with question slug, changed labels, and graded row counts. The name follows the existing seed env flag style (`SEED_INCLUDE_PLACEHOLDERS`).

DISCLOSE and REGRADE remain possible future explicit workflows, but they are not defaults. Silent in-place historical key drift is forbidden by default.

## Resolution State

Implementation in progress on `fix/bug-281-seed-key-change-guard`; keep this bug **Open** until the fix merges, promotes to production, and deploy proof is recorded.

Implemented contract:

- `computeAnswerKeyChanges()` detects only `is_correct` changes on existing choice labels; new choices and text/explanation/order changes do not trip the guard.
- `syncQuestionsFromFiles()` runs the guard inside the existing per-question transaction after locking the question and before mutating question/choice rows.
- A blocked import throws through the existing per-file wrapper, so the operator sees the question slug, file path, changed labels, and graded row counts.
- `SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY=true` explicitly overrides the block and logs the same audit context. The override is intentionally noisy and off by default.
- Seed operator docs now describe the default block and override flag before a manual content reseed reaches the guard.

## Failing Test Sketch

```typescript
it('does not silently flip is_correct on a choice referenced by graded history', async () => {
  await seedQuestionWithAttempt({ correctLabel: 'B', userSelected: 'B' }); // graded correct
  await runQuestionSync({ ...sameQuestion, correctLabel: 'C' });           // key change

  await expect(sync).rejects.toThrow(
    /Refusing to change answer key for .* because graded history exists/,
  );
  await expect(readCurrentCorrectLabels(question.slug)).resolves.toEqual(['B']);
});
```

## Related

- BUG-266 (archived) added the delete-path reference guard this upsert path lacks.
- Operational context: seed content (`content/questions/imported/`) is gitignored and clone-specific, so import behavior differs across clones — which makes silent key flips even harder to notice or reproduce.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (five independent DDIA-lens reviewers; line-level verification against `e3853656`).
