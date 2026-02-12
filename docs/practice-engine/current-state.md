# Practice Engine: Current State and Known Issues

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** What's working, open debt, SPEC-019 status, product decisions
> **Last Verified:** 2026-02-12

---

## 1. What's Fully Working

- All three practice modes (ad-hoc, tutor, exam)
- Session lifecycle: create → answer → navigate → review → end → summary
- In-run question navigation (back/jump) in both tutor and exam modes
- Per-question session summary with explanations
- Bookmark toggle on question view
- Dashboard stats with session context (grouping by session)
- History page with tabbed Sessions + Questions views (SPEC-021)
- Session history with drill-down to per-question breakdown
- Error handling with visible recovery actions everywhere
- Rate limiting on mutation-heavy actions; optional idempotency keys supported for key mutations

---

## 2. Open Debt (Practice-Specific)

- **BS-009:** Session Review Navigation Gap — review-mode back links lose session context; no session-aware next/prev navigation
- **BS-010:** Review Mode Attempt Identity Gap — review mode always loads the latest attempt for a question (no `attemptId` in URL)
- **BS-011 Bug A:** History Questions tab uses `mode=review` only for Correct rows (Incorrect rows route to reattempt URLs); inconsistent with other review entry points + subtitle copy
- **BS-011 Bug B:** Choice label desync on standalone question page (QuestionCard labels vs Feedback choice explanations)

---

## 3. SPEC-019 Status (UX Redesign)

| Phase | Status | What's Left |
|-------|--------|------------|
| **Phase 1: Stabilize** | Done | All acceptance criteria met |
| **Phase 2: UX Redesign** | **Implemented** (2026-02-09) | Done — `/app/practice/quick` created; `/app/practice` refactored into landing page; `APP_PRACTICE_QUICK` route constant added |
| **Phase 3: Cross-Page IA** | **Implemented** (2026-02-09) | Done — actionable dashboard activity + session drill-down; progressive tag filters; review clarification + filters; origin-aware question navigation; improved empty states |

---

## 4. Product Decisions (2026-02-12)

| Decision | Outcome | Reference |
|----------|---------|-----------|
| **History IA** | `/app/review` replaced by `/app/history` with Sessions + Questions tabs. | SPEC-021 |
| **Questions tab scope** | Questions tab is a filterable attempted-question log (result/source server-side filtering; difficulty/tag client-side in v1). | SPEC-022 |
| **Session runner route** | Stays at `/app/practice/[sessionId]` (NOT renamed to `/app/practice/sessions/[id]`). Static `quick` segment takes priority over dynamic `[sessionId]` in Next.js routing. | SPEC-019 §5.2 |
| **Nav label** | Nav item is **History** (not Review). | SPEC-021 |
