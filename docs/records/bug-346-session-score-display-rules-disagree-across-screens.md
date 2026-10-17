# BUG-346: One Session Shows 0% in History and a Dash on Its Summary and the Dashboard

**Status:** Open — move the score display rule to one server-side owner, red first against the two contradicting tests
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Each screen decides for itself when a session's score is a percentage and when it is a dash. The rules already disagree.

Take a tutor session ended with no answers. Unanswered available items count toward the score (ADR-022), so it has `scored = N`, `correct = 0` and `answered = 0`. The three screens show it differently:
- History: "0/N correct (0%)".
- The dashboard: "0/N correct (—)".
- The session summary: "—".

Two tests pin the opposite outputs for that same input. This is the family BUG-163 and BUG-164 fixed (one session, different accuracy per screen). It came back because DEBT-221 kept `computeAccuracy()` returning 0 for "nothing scored" and left the dash rule to each view.

## Evidence

**The dash rule, by screen:**
- Dashboard: `app/(app)/app/dashboard/page.tsx:188-191` shows a percentage when `scored > 0 && (mode === 'exam' || answered > 0)`.
- Summary: `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:37-43` uses the same predicate.
- History: `app/(app)/app/history/components/history-sessions-tab.tsx:184-185` shows a percentage when `scored > 0`.
- Post-exam review: `post-exam-review-view.tsx:103-105` uses `scored > 0`.

**The tests that pin both answers:**
- `session-summary-view.test.tsx:113`, "shows — for tutor summary when answered is zero".
- `history-sessions-tab.test.tsx:475`, "shows tutor zero-answered accuracy as 0%".
- R20's agreement test (`tests/integration/scores-when-content-changes.integration.test.ts`) compares the numbers, not their display, and only for an exam.

**The same split for duration:**
- History caps it at ">120m" (`history-sessions-tab.tsx:53-61`).
- The summary shows the exact value (`session-summary-view.tsx:102`).

**The same formatting, copied:**
- The percent formatter is written four times: `dashboard/page.tsx:33-35`, `history-sessions-tab.tsx:45-47`, `post-exam-review-view.tsx:104` and `session-summary-view.tsx:37`.
- `computeAccuracy` returns 0 when nothing is scored (`src/domain/services/statistics.ts:12-15`). So "0%" and "nothing to score" share one value, and each caller must separate them.

**Dead helpers still listed as owners:**
- `computeSessionProgress` and `getNextQuestionId` (`src/domain/services/session.ts:13,37`) have no production caller.
- `docs/architecture/practice-engine.md:47` still lists them as the session state machine helpers.
- `get-next-question.ts:233-244` applies a different next-item rule.

**History:** BUG-163, BUG-164 and BUG-187 (accuracy differed by screen); DEBT-221 (moved the dash rule into the views); DEBT-493 increment 2 (`641bb9f3`, rewrote History's predicate on its own).

## Impact

A learner sees two different scores for one session, on the screen that matters for board preparation. P3: no data is wrong, only its display, but this family has now recurred after two fixes.

## Options

1. **The server returns `accuracy: number | null` from one domain function,** null when nothing should show a percentage. One presenter formats the score and duration for every screen. *Recommended:* it ends the family rather than aligning four copies again.
2. **Align History's predicate with the other two.** That fixes today's case and leaves four copies to drift.

## Resolution (proposed)

Option 1, red first: a test that renders one zero-answered tutor session through every screen and expects one label. Decide which label is right (the summary's dash matches DEBT-221's intent), then correct the test that pins the other. Delete the dead helpers or make them the owners, and correct `practice-engine.md`.

## Verification

- [ ] One test renders the same session row through History, the dashboard, the summary and post-exam review, and they agree.
- [ ] No screen computes the dash rule or the percent format itself.

## Related

- DEBT-221, BUG-163, BUG-164 (closed): the earlier fixes of this family.
- BUG-347: the exam's own timing rules, which the summary also reads.
