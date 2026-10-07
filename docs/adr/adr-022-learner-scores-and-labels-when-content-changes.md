# ADR-022: Learner Scores and Labels When Content Changes

**Status:** Accepted, as amended 2026-10-03 (Decision 3's rule; see [Amendment](#amendment--2026-10-03)) and 2026-10-05 (what a page shows for an item no score counts; see [Amendment](#amendment--2026-10-05))
**Date:** 2026-10-03
**Implementation:** Implemented and in production since 2026-10-03, by [DEBT-493](../_archive/debt/debt-493-learner-scores-and-labels-when-content-changes.md#verified-closeout--2026-10-03-utc), released through promotion #1355.
**Decision Makers:** The owner, who on 2026-10-03 asked for every remaining decision that can be settled in code to be decided from first principles, "like the best software engineers in the world and the best physicians in the world who are designing this question bank", and executed. This record decides the three questions [ADR-021](./adr-021-question-revisions-and-content-releases.md) left to the owner: withdrawn-item scoring, answer-key regrade, and how an unavailable question is labeled ([DEBT-484](../_archive/debt/debt-484-question-rewrite-history-identity.md#verified-closeout--2026-09-30-utc), [BUG-317](../_archive/bugs/bug-317-content-release-documentation-overclaims.md#verified-closeout--2026-10-02-utc)).
**Depends On:** ADR-021 (immutable revisions; attempts bind the revision they were graded against).

---

## Context

ADR-021 made content immutable: an attempt and a session item bind the revision the learner saw, and a stored grade is never rewritten. It left open what a learner's *score* should be once that content changes, and what a learner should be told. A read-only investigation on 2026-10-03, against `main` at `94b3b87a`, established:

1. **The runtime cannot tell why a question is unavailable.** Every learner surface decides availability from `questions.status !== 'published'` alone. No runtime code reads `question_withdrawals` or `question_holds`. So a question permanently withdrawn as unsafe, one held for clinical review, and one retired for editorial reasons all read "This question has been withdrawn." When a hold lifts, the label silently disappears.
2. **Exam scoring penalizes what the learner cannot change.**
   - A saved draft on an exam item that is withdrawn mid-session is graded silently at finalization, though the learner can no longer reach the item to change it.
   - An unanswered withdrawn item becomes an omitted attempt scored incorrect, and Review & Submit warns it "will be scored as incorrect" with no way to avoid that.
   - Every score (session accuracy, the post-exam "X of N", history, dashboard accuracy) counts attempts on withdrawn questions.
3. **Content can be revealed to a learner who never answered it.** An omitted exam item that is later withdrawn becomes fully reviewable, key and explanation included. Withdrawn content may be unsafe, and ADR-021 §3 intended it to be visible only to learners who answered it.
4. **A corrected answer key leaves stored grades misleading, with no regrade.** Every read path uses the grade stored at answer time against the old key. So the "Incorrect" practice filter misleads both ways:
   - a learner who picked the old, wrong key is never re-served the question, and keeps the wrong fact;
   - a learner who picked the now-correct answer is told they were wrong.

   The F-12 notice ("This question has been updated") fires for any change, so a typo fix and a key flip look the same.

## Principles

These are the principles a clinician-educator and a careful engineer would hold a question bank to:

- **A score measures knowledge against content that stands.** An item whose content was found wrong or unsafe, is under clinical review, or whose key was corrected after the learner answered, is not a valid measurement. It should neither penalize nor credit the learner. Psychometric practice for high-stakes examinations is the same: a flawed item is removed from scoring.
- **History is facts; scores are views.** What a learner saw and chose, and the grade given at the time, are immutable facts (ADR-021). A score is derived from those facts and from what is known *now* about the content. When the knowledge changes, every score changes at once, consistently and visibly. Nothing is rewritten in place.
- **Tell the learner what happened and what to do.** Medical publishing issues an erratum, not a silent edit. When content a learner relied on is withdrawn or corrected, the learner is told at the point they revisit it, with a plain clinical caution.
- **Unsafe content is shown only to someone who already saw it,** and then with a caution.

## Decision

### 1. Four availability states, derived at read time

A question is in exactly one learner-facing state. The runtime derives it from `questions.status`, `question_withdrawals` and unlifted `question_holds`, with this precedence (the same as activation's eligibility):

| State | When | Label | Notice |
|---|---|---|---|
| **Available** | `status = 'published'` | — | — |
| **Withdrawn** | not published, and a withdrawal is recorded for the question | Withdrawn | "This question was withdrawn. Its answer and explanation may be inaccurate or outdated, so don't rely on them." |
| **Under review** | not published, no withdrawal, and an unlifted hold on a revision of the question | Under review | "This question is under review. Its answer or explanation may change, so don't rely on them until it returns." |
| **Retired** | not published, with neither | Retired | "This question has been retired from the bank." |

A withdrawal is permanent and wins over a hold. When a hold lifts, the question is *Available* again if the active release publishes it; otherwise it reads as *Withdrawn* or *Retired*, by the same precedence. The Withdrawn and Under review notices are clinical cautions. A retired question's content was not found wrong, so its notice is neutral and carries no caution.

The label replaces today's single "Withdrawn". It also replaces the three wordings for an unavailable question ("[Question no longer available]", "Question no longer available.", "This question was removed or unpublished.") on every surface where the learner answered it: review, post-exam review, the session breakdown, history, the dashboard, bookmarks, the navigator, and Review & Submit. A learner-facing reason text is not shown: a withdrawal's recorded reason is written for the clinical audit, not for learners. A learner-facing erratum field is a possible later addition.

### 2. Content is revealed only to a learner who answered

An unavailable question's stem, key and explanation are shown only to a learner who **answered** it, that is, selected a choice. An omitted attempt is not an answer. An exam item the learner left unanswered, which became unavailable, shows only its label. This sharpens ADR-021 §3's "attempted" to "answered", which is what that section intended.

### 3. One scoring rule, everywhere a score is computed

> **Amended 2026-10-03.** The rule below is replaced by the [Amendment](#amendment--2026-10-03): retired questions keep counting, and whether the learner had a fair chance at an item is recorded when the session ends. The surfaces it applies to and key corrections are unchanged. The disclosure keeps its form, but its reasons change: retirement is no longer one, and an item removed during its session is.

> An item counts toward a score only while its question is **Available** and, if it was answered, the answer key of the revision it was graded against is **still the current key**.

An item that does not count leaves both the numerator and the denominator. This applies to:
- session accuracy and the post-exam "X of N correct";
- history session scores;
- dashboard accuracy, overall and over seven days;
- the Review & Submit warning, which counts only scored unanswered items. Unavailable items are listed as "Won't be scored".

*Extended 2026-10-07 (DEBT-498): an answer on a key corrected since is listed "Won't be scored" too, since this rule leaves it out, including an exam draft on such a key, since submission grades it against the revision it was given.*

**Activity counts are not scores.** "Total answered" and the streak count the work the learner did, so they keep counting every attempt.

**Scores are derived at read time** from the immutable attempts and the current state of the content. No stored grade is rewritten, and no new column is needed. A later withdrawal, hold, lift or key correction is therefore reflected on every surface at once. When a hold lifts and the question is published again, its items count once more, except an attempt whose key was corrected.

**Disclosure.** Where a session or a list has unscored items, it says so: "N questions aren't scored: withdrawn, under review, retired, or their answer was corrected."

**Retired items do not count either.** Their content was not found wrong, but the learner can no longer revisit them, and a single rule ("scores count only the current bank's valid items") is easier to trust and verify than one with a timing exception for items retired mid-session. Retirement is rare in this bank.

### 4. Answer-key corrections are detected, disclosed and re-practiced

An answered attempt is **key-corrected** when the current revision's correct choice differs, by label or by text, from the correct choice of the revision the attempt was graded against. This comparison is complete for single-best-answer items: a different correct answer always changes the correct choice's label or text. It is conservative: reordering or rewording the correct option also counts, at the cost of one unscored attempt and one re-practice prompt, which is harmless.

A key-corrected attempt:
- **does not count toward any score** (Decision 3);
- **shows a distinct notice** instead of F-12's generic "updated": "The answer to this question was corrected after you answered. This attempt isn't scored. Practice the corrected question.";
- **is included in the "Incorrect" practice filter**, so a learner who may have learned the old answer re-learns the corrected one.

Stored grades are never regraded. Mapping an old selection onto a new revision's choices would be a guess, because choice identities differ between revisions. Excluding the attempt and prompting re-practice gives the learner the right outcome without inventing a grade.

> **Amended 2026-10-05.** The attempt is also shown ungraded: its review no longer presents the superseded key as correct, nor its explanation ([Amendment](#amendment--2026-10-05)).

### 5. Exams: an item that becomes unavailable mid-session

- The item stays in the session. Its saved draft, if any, is kept and graded at finalization as today, since the record is immutable. By Decision 3 it does not count, whatever the grade.
- The active notice gains: "It won't count toward your score."
- The navigator and Review & Submit show the item's label instead of "[Question no longer available]".
- The submit warning counts only items that will be scored.
- Tutor sessions are unchanged: answering an unavailable item is refused, and Decision 3 excludes it from the session's accuracy.

### 6. What is not decided here

- **The production bootstrap** is the owner's operational decision.
- **Learner-facing erratum text** (what was wrong, and the correct fact) needs an authoring field. It is a possible later addition.
- **Tag- or category-level performance and readiness** do not exist today. When added, they follow Decision 3.

## Consequences

- **Every score becomes correct as content changes,** and consistent across surfaces. Learners are told why an item no longer counts.
- **A learner's past session score can change** when a question in it is withdrawn, held, retired or key-corrected later, or when a hold lifts. This is intended, and it is disclosed. (Amended 2026-10-03: retirement no longer changes a past score; see the [Amendment](#amendment--2026-10-03).)
- **Read paths gain the availability and key-correction derivations.**
  - Availability needs two small lookups, made only for questions that are not published, so reads of published questions cost nothing more: withdrawals by their primary key, and unlifted holds through the question's revisions, since holds have no index that leads with the question (DEBT-493).
  - The key-correction check compares the correct choice of two revisions.
  - Aggregate queries (history, dashboard) gain the same predicates. DEBT-493 measures their cost before shipping.
- **The domain gains an availability value** in place of the boolean "withdrawn". F-11 and F-12 in the Pattern Registry are revised to match.
- **ADR-021 is unchanged.** Revisions and stored grades stay immutable; this record defines how they are read.

## Amendment — 2026-10-03

Decided under the owner's 2026-10-03 delegation, after a review notice asked whether learners' past scores should change after the fact ([DEBT-494](../_archive/debt/debt-494-read-time-scores-owner-confirmation.md)).

**What changed.** Decision 3 treated two questions as one: whether the learner had a fair chance at an item, and whether its content is still trusted. The first is a fact about the moment the session ended, and cannot be reconstructed later. The second can change at any time. Decision 3's rule is replaced by:

> An item counts toward a score when **(1)** the learner had a fair chance at it, and **(2)** its content is not now in doubt.
> - **A fair chance** is recorded when the session ends: the item's question was available then, or, in tutor mode, the learner had already answered it. A tutor answer is graded when it is given, on content then available. An exam draft becomes final only at submission. An attempt outside a session was answered on an available question.
> - **In doubt** means withdrawn, under review, or, for an answered item, its graded key since corrected (Decision 4). It is read when the score is read.

**Consequences.**
- **Retiring a question no longer changes any past score.** Retirement is curation: the content was not found wrong, so answers to it stay valid measurements.
- **A past score changes only when the content's validity changes:** a withdrawal, a hold or its lift, or a key correction. The score says so (Pattern Registry F-13). This is the psychometric practice of removing a flawed item, applied when the flaw is found.
- **The disclosure names the amended reasons:** "N questions aren't scored: withdrawn, under review, removed mid-session, or their answer was corrected." Pattern Registry F-13 changes with the code that applies the amended rule (DEBT-493).
- **An item that became unavailable during its session does not count,** answered or not, unless it was a tutor answer already given. A lift after the session ends does not restore it, because the learner could not reach it. A lift before the session ends restores it only if its question is available again when the session ends.
- **No second "score when taken" value.** Once retirement is out, a past score moves only for a disclosed clinical reason. Showing the superseded value would invite learners to rely on a score that counted flawed content.
- **Storage.** Each session item records the fair-chance fact when its session ends, in one nullable column. A session that ended before the column existed is recorded once, when the column is added, from the bank as it stands then: an item on a question unpublished by then had no fair chance unless a tutor answer gave it one. Once scores read it, those sessions keep the scores they show, except that a tutor answer on a question retired before then counts again, and a later retirement changes none of them ([DEBT-494](../_archive/debt/debt-494-read-time-scores-owner-confirmation.md#consequences-and-cost-verified--2026-10-03)).
- **Decision 5 is unchanged in effect:** an exam item unavailable at submission does not count. The active notice says "It won't count toward your score." only where that is true, so not for a tutor answer already given on a question retired since.

**Alternatives rejected**, in addition to those below:
- **Keep Decision 3 as written** (DEBT-494 option A). Every retirement would quietly lower past denominators for every learner who saw the question, for no validity reason.
- **Freeze each session's score when it ends** (option B). A question later withdrawn as unsafe would keep counting.
- **Show both the current score and the score when taken** (option D). See above.
- **Count retired items without recording the fair-chance fact** (option C as first written). An item retired mid-session would count against a learner who could not reach it, unless its timing were rebuilt from history the system does not keep.

## Amendment — 2026-10-05

Decided under the owner's 2026-09-28 delegation, after DEBT-496's screenshots showed a key-corrected review that grades the attempt beneath its caution ([DEBT-498](../debt/debt-498-reviews-grade-items-whose-content-is-in-doubt.md)).

**What changed.** Decisions 2 and 4 settled what a learner is told and what a score counts. They did not settle what the page beneath the notice shows. Every view kept the stored grade's signals:
- a green or red verdict;
- the keyed choice styled as correct;
- the explanation written for that key.

A review of a key-corrected attempt therefore says "This attempt isn't scored." above "Correct", and presents the superseded answer as right. A withdrawn or held item does the same beneath a caution that says not to rely on it. The rule added is:

> **What the score leaves out because its content is in doubt, the page does not grade.** An answered item whose content is in doubt is shown ungraded wherever its result appears. "In doubt" is as the Amendment of 2026-10-03 defines it: key corrected since the learner answered, withdrawn, or under review. It also covers a question that no longer exists. That Amendment's text does not name that case, but its scores have always treated it as in doubt (`contentInDoubt(null)` in `src/domain/services/scoring.ts`), and this Amendment states it.
> - **The verdict** reads "Not scored", in a neutral tone, in place of Correct or Incorrect.
> - **The choices** keep the learner's selection, marked "Your answer", and drop the success and destructive styling. The choice keyed in the revision answered is marked in words.
> - **A key-corrected item** marks the old key "Answer before the correction" and does not show the explanation or reference written for it, because they argue for the superseded answer. The notice's link to the corrected question is the way to the current answer.
> - **A withdrawn or held item** marks its key "Keyed answer" and keeps its explanation, beneath the caution that already says not to rely on them. Decision 2 shows that content to the learner who answered.
> - **Lists** (History, the Dashboard's recent activity, the session breakdown and the post-exam navigator) show "Not scored" in place of the result. History's Correct and Incorrect filters follow what each row shows. Its Incorrect-first and Correct-first sorts place such a row after every graded row, since ranking it with either verdict would credit or penalize it.
>
> *Extended 2026-10-07 (DEBT-498 increment 2b): the sort placement, which this Amendment had left undecided.*

**Consequences.**
- **A page and a score agree.** An item that no score counts is never shown as credited or penalized.
- **No regrade.** The stored grade is unchanged. It is not shown while the content is in doubt, and is shown again if the doubt ends, for example when a hold lifts.
- **Retired items keep their grade.** Retirement is curation, not doubt (the Amendment of 2026-10-03).
- **Absence of a fair chance is not doubt.** An exam draft on a question retired during that exam is left out of the score because the learner could not reach the question at the end, not because its content is in doubt. Its grade stays shown, since retired content stands, and the score's disclosure (F-13) explains the smaller denominator.
- **Practice after a correction is unchanged.** The Incorrect practice filter still offers a key-corrected question again (Decision 4).

**Alternatives rejected** (DEBT-498):
- **Keep the notice alone.** Color and the verdict are the strongest signals on the page, and they contradicted the notice.
- **Hide the attempt's content.** This erases the learner's own record, which Decision 2 keeps for answered items.
- **Show the corrected answer on the old review.** The revisions' choices differ, so the learner's choice may not exist in the current revision. It would also mix revisions on one page, and hand over the answer that Decision 4 has the learner re-practice.

## Alternatives rejected

- **Keep today's behavior.** It penalizes learners for unsafe or flawed content they could not change, and leaves a corrected key's grades misleading.
- **Store an "excluded" flag at finalization.** A later withdrawal or key correction would not reach earlier sessions, and a lifted hold would not restore a score. Every surface would need the flag kept in step.
- **Regrade stored attempts against the new key.** This guesses a mapping between different revisions' choices, and destroys the original grade.
- **Count retired items** (content not flawed). This needs a timing exception for items retired mid-session that the learner could not answer. A single rule is simpler to trust.
- **Show the withdrawal's recorded reason to learners.** It is written for the clinical audit, not for learners. An erratum field is the right vehicle, later.

## Related

- [ADR-021](./adr-021-question-revisions-and-content-releases.md): immutable revisions and releases.
- [DEBT-493](../_archive/debt/debt-493-learner-scores-and-labels-when-content-changes.md): the implementation.
- [Pattern Registry](../frontend/pattern-registry.md): F-11 (withdrawal notice) and F-12 (updated notice), revised by DEBT-493.
