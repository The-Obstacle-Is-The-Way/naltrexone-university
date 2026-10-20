# BUG-346: One Session Shows 0% in History and a Dash on Its Summary and the Dashboard

**Status:** Verifying — session screens share one score presenter; a scored, unanswered tutor session shows 0%; promotion to main remains, due 2026-10-22
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Before this fix, each screen decided for itself when a session's score was a percentage and when it was a dash, and the rules disagreed.

Take a tutor session ended with no answers. The end-of-session update makes every published item count toward the score (ADR-022), so the session has `scored = N`, `correct = 0` and `answered = 0`. Before this fix, the screens showed:
- History: "0/N correct (0%)".
- The dashboard: "0/N correct (—)".
- The session summary: "—".

Two tests pinned the opposite outputs for that same input.

The decided rules already give the answer, and it is 0%:
- **DEBT-221** shows a dash only when the denominator is 0.
- **BUG-164 and SPEC-038 FR-1** made the tutor denominator the item count, now `scored`. FR-1 says tutor rows must not show `0/0 correct (—)`.
- **History** dropped its extra clause in SPEC-038's first phase (`18b24d2a`), which changed the existing zero-answer test from a dash to "0%".
- **The dashboard and summary** kept DEBT-221's older `answered > 0` clause, so the split was never closed.

This is the family BUG-163 and BUG-164 fixed: one session, different accuracy per screen.

## Evidence

The following source and test receipts describe the defect at `134b0578`, before this fix.

**The rule, by screen:**
- Dashboard: `app/(app)/app/dashboard/page.tsx:188-191` shows a percentage when `scored > 0 && (mode === 'exam' || answered > 0)`.
- Summary: `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:37-43` uses the same predicate.
- History: `app/(app)/app/history/components/history-sessions-tab.tsx:184-185` shows a percentage when `scored > 0`.
- Post-exam review: `post-exam-review-view.tsx:103-105` uses `scored > 0`. It is exam-only, so it agrees with the others.

**The tests that pin both answers:**
- `session-summary-view.test.tsx:113`, "shows — for tutor summary when answered is zero".
- `history-sessions-tab.test.tsx:475`, "shows tutor zero-answered accuracy as 0%".
- R20's agreement test (`tests/integration/scores-when-content-changes.integration.test.ts`) compares the numbers, not their display, and only for an exam.

**The same formatting, copied:**
- The percent formatter is written four times: `dashboard/page.tsx:33-35`, `history-sessions-tab.tsx:45-47`, `post-exam-review-view.tsx:104` and `session-summary-view.tsx:37`.
- `computeAccuracy` returns 0 when nothing is scored (`src/domain/services/statistics.ts:12-15`), so every caller must decide when 0 means a dash.

History alone caps the displayed duration at ">120m". That is deliberate (SPEC-038 FR-2), not part of this defect.

**History:**
- BUG-163 and BUG-164: accuracy differed by screen.
- DEBT-221: the dash for a zero denominator.
- SPEC-038: History's tutor rule.
- `641bb9f3`: DEBT-493 increment 2 rewrote the dashboard and History predicates, and each kept its earlier clause.

## Impact

Until promotion, a learner sees two different scores for one session. No data is wrong, only its display, but the family has recurred after two fixes. P3.

## Options

1. **One shared score presenter that every screen calls, and drop the `answered > 0` clause.** *Recommended:* it applies the rules already decided, and gives the next change one place to land.
2. **The server returns `accuracy: number | null`.** Every consumer changes. DEBT-221 kept the domain's `computeAccuracy` numeric to preserve SPEC-003 and its tests; it did not consider a nullable response field. Option 1 fixes the split without an API change.

## Resolution (decided)

Option 1: `app/(app)/app/shared/score-percentage.ts` owns the percentage or dash. History, the dashboard, the summary and post-exam review call it. The dashboard's overall and seven-day accuracy use it too. The presenter reads `scored` and `accuracy`; it does not take the mode or answered count.

The shared render test failed first on the dashboard and summary for one unanswered tutor row. Six cases now render the same row through History, the dashboard and the summary: tutor and exam, each with scored unanswered items, no scored items, or a reduced denominator requiring rounding. The summary's former dash assertion now expects 0%. R20 names these proofs. The domain accuracy and API types are unchanged.

## Verification

- [x] One test renders the same tutor session through History, the dashboard and the summary, and they agree.
- [x] All four session screens call the shared score presenter; none keeps its own percentage formatter.
  - Corrected 2026-10-19: this item first read "No screen computes the score label or percent format itself". The shared presenter owns the percentage-or-dash decision; the dashboard and History still write their own "X/Y correct" text around it.
- [ ] Promote to `main`; due 2026-10-22.

## Related

- DEBT-221, BUG-163, BUG-164 (closed): the earlier fixes of this family.
- BUG-347: the exam's own timing rules.
