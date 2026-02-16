# Practice Engine: Current State and Known Issues

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** What's working, open debt, SPEC-019 status, product decisions
> **Last Verified:** 2026-02-16

---

## 1. What's Fully Working

- Two session modes (tutor, exam) + Quick Practice route (stateless, filters-based, no session tracking)
- Session lifecycle: create → answer → navigate → review → end → summary
- In-run question navigation (back/jump) in both tutor and exam modes via Question Navigator grid
- Per-question session summary with explanations
- Bookmark toggle on question view
- Dashboard stats with session context (grouping by session), attempt-specific review links
- History page with tabbed Sessions + Questions views (SPEC-021)
- Session history with drill-down to per-question breakdown
- Session review navigation with sequential Previous/Next and "Question X of Y" (SPEC-027)
- Color-coded question navigator grid in review mode showing correct/incorrect/unanswered (SPEC-028)
- Status and difficulty filters with segmented control redesign (SPEC-028)
- Client-side timeouts and observable failure states for resilient dev experience (SPEC-029)
- Error handling with visible recovery actions everywhere
- Rate limiting on mutation-heavy actions; optional idempotency keys supported for key mutations

---

## 2. Open Debt (Practice-Specific)

- **BS-014:** Practice Starter — Silent truncation when fewer questions match than requested count (no spec yet)
- **BS-018:** Question View UX Unification — Tutor mode loses answered state on revisit; no Previous button in active practice; navigation placement inconsistent between practice and review (specced as SPEC-030)

---

## 3. SPEC-019 Status (UX Redesign)

| Phase | Status | What's Left |
|-------|--------|------------|
| **Phase 1: Stabilize** | Done | All acceptance criteria met |
| **Phase 2: UX Redesign** | **Implemented** (2026-02-09) | Done — `/app/practice/quick` created; `/app/practice` refactored into landing page; `APP_PRACTICE_QUICK` route constant added |
| **Phase 3: Cross-Page IA** | **Implemented** (2026-02-09) | Done — actionable dashboard activity + session drill-down; progressive tag filters; review clarification + filters; origin-aware question navigation; improved empty states |

---

## 4. Product Decisions (2026-02-16)

| Decision | Outcome | Reference |
|----------|---------|-----------|
| **History IA** | `/app/review` replaced by `/app/history` with Sessions + Questions tabs. | SPEC-021 |
| **Questions tab scope** | Questions tab is a filterable attempted-question log (result/source server-side filtering; difficulty/tag client-side in v1). | SPEC-022 |
| **Session runner route** | Stays at `/app/practice/[sessionId]` (NOT renamed to `/app/practice/sessions/[id]`). Static `quick` segment takes priority over dynamic `[sessionId]` in Next.js routing. | SPEC-019 §5.2 |
| **Nav label** | Nav item is **History** (not Review). | SPEC-021 |
