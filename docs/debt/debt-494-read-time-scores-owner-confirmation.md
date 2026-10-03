# DEBT-494: Past Scores Change After the Fact

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — decided 2026-10-03 under the owner's delegation ([Decision](#decision--2026-10-03)); ADR-022 amended, implementation tracked by DEBT-493. Close once the amendment is promoted.
**Priority:** P2
**Date:** 2026-10-03
**Resolved:** —
**Verification receipts:** —

---

## Summary

[ADR-022](../adr/adr-022-learner-scores-and-labels-when-content-changes.md) Decision 3 scores at read time. An item counts toward a score only while its question is available, and, from DEBT-493 increment 4, only while its answer key is unchanged. So a learner's past scores move when content changes, with nothing new answered:
- a completed session's score in History and on its summary page;
- the Dashboard's overall and seven-day accuracy.

Retired questions leave every score too, although their content was not found wrong.

These are fairness and trust choices for learners. ADR-022 made them under the owner's 2026-10-03 delegation ("decide from first principles … and execute"). A review notice raised the concern on 2026-10-03. The owner asked for it to be investigated and recorded, then asked for it to be decided from first principles, as the best engineers would, for the learners the bank serves.

## Evidence

Investigated on 2026-10-03, against `main` at `bad0ad67` and the DEBT-493 branches.

- **The concern is accurate.** ADR-022 lists it as an intended consequence: "A learner's past session score can change when a question in it is withdrawn, held, retired or key-corrected later, or when a hold lifts. This is intended, and it is disclosed." It rejects two alternatives:
  - storing an "excluded" flag at finalization, because a later withdrawal would not reach earlier sessions and a lifted hold would not restore a score;
  - counting retired items, because an item retired mid-exam would then need a timing exception.
- **No score is stored.** Each surface derives its score when it is read:
  - History joins each item's question as it stands now (`findCompletedHistorySummariesByUserId`, released via #1342);
  - the Dashboard's accuracy does the same through `scoreByUserId` (DEBT-493 step 3);
  - the summary page re-reads availability when it loads (`summarizePracticeSession`, step 4).

  Only the end and finalize responses are a snapshot. They are replayed unchanged for 24 hours, under their idempotency key.
- **How much a score moves.** One unscored item in a 20-item session moves its accuracy by up to about five points. A hold moves a score twice: once when it is placed, and back when it lifts.
- **What learners are told.** Every score that leaves items out carries Pattern Registry F-13's disclosure: "N questions aren't scored: withdrawn, under review, retired, or their answer was corrected." A learner is told why a denominator shrank, but not that the score was different before.

## Impact

- **Trust.** A learner who remembers 72% may see 74% a month later, with an explanation, but no "was" value. In a board-preparation product, an unexplained-looking change in a past result can read as an error.
- **Fairness.** Excluding a flawed item is the psychometric norm for high-stakes exams, and is what ADR-022 rests on. Excluding a retired item is a simplification, not a correctness requirement.
- **No data at risk.** Attempts and grades are immutable (ADR-021). Every option below can be adopted later without losing anything, except that a snapshot cannot be backfilled for sessions that ended before it is introduced.

## Options

| Option | What learners see | Cost |
|---|---|---|
| **A. Keep ADR-022 as decided** (recommended) | Scores follow the bank as it is now, with F-13's disclosure | None |
| **B. Freeze each session's score when it ends** | A past session never changes. A question withdrawn as unsafe keeps counting in earlier sessions, and a lifted hold cannot restore an item. The Dashboard would still need its own rule. | A migration to store the totals, every read path switched to it; sessions that ended before it keep the read-time score |
| **C. Keep retired items counted** | Retirement no longer moves a score; withdrawn, under-review and key-corrected items still leave it | `countsTowardScore` changes, plus the timing rule ADR-022 avoided: an item retired mid-exam and left unanswered must still not count, or the learner is marked wrong for an item they could not reach. Contracts and tests follow. |
| **D. Show both** | Read-time score, plus "N% when taken" on History and the summary | Option B's storage, plus UI. The "when taken" value exists only for sessions that end after it ships. |

**Initial recommendation, superseded by the [Decision](#decision--2026-10-03): A.** A score that counts an item now known to be flawed or under clinical review is the wrong measurement. ADR-022's principle is "history is facts; scores are views". Retirement is rare in this bank, and F-13 tells the learner why a score moved. If retirement becomes routine, adopt C. If learners report confusion, adopt D, which keeps A's rule and adds the value they remember.

## Decision — 2026-10-03

None of the four options as written. ADR-022 Decision 3 merged two questions that have different answers, so it is amended ([ADR-022 Amendment](../adr/adr-022-learner-scores-and-labels-when-content-changes.md#amendment--2026-10-03)):

- **Did the learner have a fair chance at the item?** This is a fact about the moment the session ended. It cannot be rebuilt later, so it is recorded then: the question was available at the end, or the learner had already answered it in tutor mode.
- **Is the content still trusted?** This can change at any time. A withdrawn, held or key-corrected item stops counting when that is known, with a disclosure.

An item counts when both hold.

**Why.** A score is a learner's evidence of readiness. It should measure what they knew, on content the bank still stands behind, when they had a fair chance to answer.
- Excluding flawed content after the fact is right. It is how a flawed exam item is handled.
- Retiring content is curation, not a finding of error. Under option A it rewrote past scores; now it changes nothing.
- An item that became unavailable mid-session never counts against the learner, because the recorded fact says they could not reach it.
- A second "score when taken" value (option D) is not built. Past scores now move only for disclosed clinical reasons, and showing the superseded value would invite reliance on a score that counted flawed content.
- Freezing (option B) would keep counting unsafe items.

**Effect on DEBT-493.** History scores are in production under Decision 3's rule, which excludes retired questions. Dashboard accuracy and the session summary's writer were built on the same rule and are not shipped. All three move to the amended rule, after a step that records the fair-chance fact when a session ends. DEBT-493's [Progress](./debt-493-learner-scores-and-labels-when-content-changes.md#progress) holds the revised plan.

## Consequences and cost, verified — 2026-10-03

A second review notice the same day summarized the decision's cost: it reopens finished and released work, needs a permanent database change, and treats sessions that ended before that change as having had a fair chance. The owner asked for it to be checked. Each claim, against the code and DEBT-493's plan:

| Claim | Finding |
|---|---|
| Retired questions keep counting, and an item counts only if the learner had a fair chance | Accurate: the Decision above. |
| A fair chance can only be captured when a session ends, so it needs a new, permanent field | Accurate. Migration 0050 adds the nullable `practice_session_question_states.fair_chance_at_end`; applied migrations are never edited here. |
| Sessions that ended before the change are treated as having had a fair chance | Accurate as first written, and corrected; see below. |
| History, released today, changes again | Accurate. A question retired since counts again. For sessions that ended before 0050, see below. |
| Dashboard accuracy, which passed its gate, won't ship as built | Accurate. It was built on the earlier rule and held; it ships on the amended rule. |
| Several more pull requests | Accurate: four (the fair chance; history and dashboard; the session summary; Review & Submit with the active notice), then the closeouts. |

**The correction: sessions that ended before 0050.** Reading an unrecorded item as a fair chance would have counted, against the learner, an exam item that became unreachable during the session. It would also have changed the scores those sessions already show, which leave out every unpublished question (DEBT-493 step 2). So 0050 records them once, when it runs, from the bank as it stands then: an item on a question unpublished by then had no fair chance unless a tutor answer gave it one.
- Those sessions keep the scores they show, except that a tutor answer on a question retired before 0050 counts again, which the amended rule intends.
- A later retirement changes none of them.
- A session that ends after 0050 runs, but before the new code serves, is left unrecorded and reads as a fair chance. Migrations run at the start of the Vercel build (`vercel.json`), so that window lasts one build.

The backfill fills only items not yet recorded, so running it again changes nothing. A marked block, `-- DEBT-494 fair-chance backfill`, is executed against arranged rows in `session-fair-chance-backfill.integration.test.ts`.

## Related

- [ADR-022](../adr/adr-022-learner-scores-and-labels-when-content-changes.md), Decision 3 and Consequences
- [DEBT-493](./debt-493-learner-scores-and-labels-when-content-changes.md): the implementation, increment 2
- [Pattern Registry](../frontend/pattern-registry.md) F-13: the unscored disclosure
