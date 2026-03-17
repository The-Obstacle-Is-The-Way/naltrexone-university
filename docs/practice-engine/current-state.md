# Practice Engine: Current State and Known Issues

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** What's working, open debt, SPEC-019 status, product decisions
> **Last Verified:** 2026-03-17

---

## 1. What's Fully Working

- Two session modes (tutor, exam) + Quick Practice route (stateless, filters-based, no session tracking)
- Session lifecycle: create → answer → navigate → review → end → summary
- In-run question navigation (back/jump) in both tutor and exam modes via Question Navigator grid
- Per-question session summary with explanations
- Bookmark toggle on question view
- Dashboard stats with session context (grouping by session), attempt-specific review links, and active-exam correctness redaction
- History page with tabbed Sessions + Questions views (SPEC-021)
- Session history with drill-down to per-question breakdown
- Session review navigation with sequential Previous/Next and "Question X of Y" (SPEC-027)
- Color-coded question navigator grid in review mode showing correct/incorrect/unanswered (SPEC-028)
- Status and difficulty filters with segmented control redesign (SPEC-028)
- Client-side timeouts and observable failure states for resilient dev experience (SPEC-029)
- Retry provenance model end-to-end (`retryOfAttemptId`, `retryOrigin`, `retrySessionId`) across controller -> use case -> repository -> DB (DEBT-265 core)
- Inline retry in ended-session review routes (`/app/questions/[slug]?mode=review&sessionId=...`) with immutable session snapshot semantics (DEBT-265 core)
- Explicit review hydration states (`attempt`, `session_unanswered`, `no_prior_attempt`, `hydration_error`) with explicit fallback UI
- Retry observability events wired server-side (`retry_submitted`, `review_hydration_outcome`, `review_identifier_normalized`) with regression coverage (DEBT-266)
- Mixed `attemptId + sessionId` previous-attempt contract is hardened (controller + use case rejection; boundary normalization defense-in-depth) (DEBT-267)
- Error handling with visible recovery actions everywhere
- Rate limiting on mutation-heavy actions; optional idempotency keys supported for key mutations

---

## 2. Active Follow-Ups (Practice-Specific)

- **Open bug register:** None. `docs/bugs/index.md` currently lists no open bugs; the BUG-186 through BUG-198 practice-engine sweep was archived on 2026-03-03.
- **[BS-014](../brainstorming/bs-014-practice-starter-question-count-ux.md):** Practice Starter question-count UX polish remains an active product/design follow-up.
- **[DEBT-318](../debt/debt-318-tutor-bookmark-before-answer.md):** Tutor mode and Quick Practice still show the bookmark action before inline feedback/explanation is visible.
- Canonical cross-layer invariant: [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md)

---

## 3. SPEC-019 Status (UX Redesign)

| Phase | Status | What's Left |
|-------|--------|------------|
| **Phase 1: Stabilize** | Done | All acceptance criteria met |
| **Phase 2: UX Redesign** | **Implemented** (2026-02-09) | Done — `/app/practice/quick` created; `/app/practice` refactored into landing page; `APP_PRACTICE_QUICK` route constant added |
| **Phase 3: Cross-Page IA** | **Implemented** (2026-02-09) | Done — actionable dashboard activity + session drill-down; progressive tag filters; review clarification + filters; origin-aware question navigation; improved empty states |

---

## 4. Product Decisions (2026-03-01)

| Decision | Outcome | Reference |
|----------|---------|-----------|
| **History IA** | `/app/review` replaced by `/app/history` with Sessions + Questions tabs. | SPEC-021 |
| **Questions tab scope** | Questions tab is a filterable attempted-question log (result/source server-side filtering; difficulty/tag client-side in v1). | SPEC-022 |
| **Session runner route** | Stays at `/app/practice/[sessionId]` (NOT renamed to `/app/practice/sessions/[id]`). Static `quick` segment takes priority over dynamic `[sessionId]` in Next.js routing. | SPEC-019 §5.2 |
| **Nav label** | Nav item is **History** (not Review). | SPEC-021 |
| **Completed-session review origin** | Session Summary review CTA and breakdown links use `from=history` so review returns to the durable History IA instead of the ended session route. | DEBT-316 |
| **Session review retry ownership** | Inline retry for ended sessions is owned by `/app/questions/[slug]?mode=review&sessionId=...`; active session runner remains `/app/practice/[sessionId]`. | Retry Logic SSOT §3 |
| **Session immutability on retry** | Retry attempts are standalone writes (`practiceSessionId = null`); historical session score/question states are never mutated. | Retry Logic SSOT §1, §6 |
| **Session-review retried marker persistence** | `wasRetried` is intentionally visit-scoped (no cross-visit persistence requirement in current contract). | DEBT-266 |
