# BUG-281: Seed Re-Import Silently Rewrites `choices.is_correct` Under Graded History, Making Stored Grades Contradict the Displayed Answer Key

**Status:** Open
**Severity:** P3
**Date:** 2026-07-05
**Confirmed:** 2026-07-05
**Component:** Content Pipeline / Seed / Review Integrity

---

## Summary

The seed syncer's delete path carefully refuses to remove choices referenced by attempts or practice-session state rows (the BUG-266 guard), but its **upsert** path has no equivalent guard: `onConflictDoUpdate` on `(question_id, label)` unconditionally rewrites `text_md`, `is_correct`, `explanation_md`, and `sort_order` — including flipping `is_correct` on choices that graded history references.

Stored grades (`attempts.is_correct`, `practice_session_question_states.latest_is_correct`) were computed against the answer key at submission time and are never regraded. But every review surface recomputes the "correct answer" highlight from **current** content. After a key-changing re-import, the two sources contradict each other on screen: a user who answered B when B was correct sees a "Correct" result badge next to a review that highlights C as the correct answer and renders their B as wrong.

The trigger is exactly the well-intentioned case: a content editor fixing a miskeyed question — the moment the fix lands, every prior answer of that question displays contradictory grading.

## Reachability

Requires a content re-import (`db:seed` / the question-syncer pipeline) that changes `is_correct` on a question that has existing attempts or session state. Content-fix imports are routine; whether any has yet flipped a key under live history is unknown — the defect is in the pipeline, and nothing prevents or even logs the occurrence.

## Reproduction

1. User answers question Q selecting choice B; B is keyed correct → attempt stored with `is_correct = true`.
2. Editor fixes Q's key in the content files (B→incorrect, C→correct) and runs the seed import.
3. User opens the completed session's review (post-exam review or completed-session review).

Expected: a deliberate, decided behavior — either grades are versioned/regraded, or the UI explains that content changed since the attempt.

Actual: the result badge says "Correct" (stored grade) while the recomputed key highlights C and shows the user's B styled as a wrong answer, with no explanation. Session scores keep the old grading; per-question displays show the new key.

## Root Cause

- [`question-syncer.ts`](../../scripts/seed/question-syncer.ts#L269-L287): the choice upsert's `onConflictDoUpdate` sets `isCorrect: choice.is_correct` with no check against existing attempt/state references — asymmetric with the same file's delete path, which does check ([`question-syncer.ts`](../../scripts/seed/question-syncer.ts#L195-L243)).
- Review surfaces dual-source correctness: stored grade for the badge, recomputed key for the highlight — e.g. [`get-completed-session-questions-with-feedback.ts`](../../src/application/use-cases/get-completed-session-questions-with-feedback.ts#L141-L152) reads the stored attempt while the correct-choice derivation comes from current choice rows.

Neither half is individually wrong; the system simply has no answer-key versioning and no policy for key changes under history.

## Impact

Users see self-contradictory grading on a medical-education product — trust-destroying on exactly the questions that needed a content fix (i.e., where the editor knows users were graded against a wrong key). No crash, no data loss, and it requires a key-changing import, so P3 — but this needs a **product decision**, not just code: regrade, version, block, or disclose.

## Proposed Fix

Decide the policy first; the code follows. Options, roughly in order of engineering honesty:

1. **Disclose (cheapest honest fix):** stamp `choices.updated_at`/an answer-key version on key changes; review surfaces compare against `attempts.answered_at` and render a "this question's content was updated after your attempt" notice instead of a silent contradiction.
2. **Regrade:** on key-changing import, recompute `is_correct` for affected attempts/state rows in the same transaction (auditable via `GET DIAGNOSTICS` row counts per `docs/dev/migration-authoring.md` norms). Changes historical scores — needs product sign-off.
3. **Block-and-fork:** refuse in-place key flips on questions with graded history (mirror the delete guard); require publishing a new question version. Strongest integrity, largest content-workflow change.

Whichever is chosen, the import should at minimum **detect and log** key flips on referenced choices (count + question slugs) so the occurrence stops being silent.

## Failing Test Sketch

```typescript
it('does not silently flip is_correct on a choice referenced by graded history', async () => {
  await seedQuestionWithAttempt({ correctLabel: 'B', userSelected: 'B' }); // graded correct
  await runQuestionSync({ ...sameQuestion, correctLabel: 'C' });           // key change

  // Today: silent flip; stored attempt says correct, current key says C.
  // Expected (policy-dependent — sketch pins the "detect" baseline):
  expect(syncReport.keyChangesOnGradedQuestions).toEqual([
    expect.objectContaining({ slug: question.slug, from: 'B', to: 'C' }),
  ]);
});
```

## Related

- BUG-266 (archived) added the delete-path reference guard this upsert path lacks.
- Operational context: seed content (`content/questions/imported/`) is gitignored and clone-specific, so import behavior differs across clones — which makes silent key flips even harder to notice or reproduce.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (five independent DDIA-lens reviewers; line-level verification against `e3853656`).
