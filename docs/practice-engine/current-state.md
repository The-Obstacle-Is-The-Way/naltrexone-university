# Practice Engine: Current State and Known Issues

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** What's working, open debt, SPEC-019 status, product decisions
> **Last Verified:** 2026-02-09

---

## 1. What's Fully Working

- All three practice modes (ad-hoc, tutor, exam)
- Session lifecycle: create → answer → navigate → review → end → summary
- In-run question navigation (back/jump) in both tutor and exam modes
- Per-question session summary with explanations
- Bookmark toggle on question view
- Dashboard stats with session context (grouping by session)
- Review page with session origin badges
- Session history with drill-down to per-question breakdown
- Error handling with visible recovery actions everywhere
- Idempotency and rate limiting on all mutations

---

## 2. Open Debt (Practice-Specific)

*No practice-specific open debt items as of 2026-02-09.*

---

## 3. SPEC-019 Status (UX Redesign)

| Phase | Status | What's Left |
|-------|--------|------------|
| **Phase 1: Stabilize** | Done | All acceptance criteria met |
| **Phase 2: UX Redesign** | **Implemented** (2026-02-09) | Done — `/app/practice/quick` created; `/app/practice` refactored into landing page; `APP_PRACTICE_QUICK` route constant added |
| **Phase 3: Cross-Page IA** | **Implemented** (2026-02-09) | Done — actionable dashboard activity + session drill-down; progressive tag filters; review clarification + filters; origin-aware question navigation; improved empty states |

---

## 4. Product Decisions (2026-02-09)

| Decision | Outcome | Reference |
|----------|---------|-----------|
| **Review page scope** | Missed-only (most recent attempt incorrect). NOT an "all questions" library. Clarify via subtitle text, not scope expansion. | SPEC-014 |
| **Session runner route** | Stays at `/app/practice/[sessionId]` (NOT renamed to `/app/practice/sessions/[id]`). Static `quick` segment takes priority over dynamic `[sessionId]` in Next.js routing. | SPEC-019 §5.2 |
| **Nav label** | Keep "Review" in nav (not "Missed Questions"). Shorter, cleaner — subtitle disambiguates on the page itself. | SPEC-019 §5.4.3 |
