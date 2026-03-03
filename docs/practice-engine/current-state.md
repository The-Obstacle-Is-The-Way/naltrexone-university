# Practice Engine: Current State and Known Issues

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** What's working, open debt, SPEC-019 status, product decisions
> **Last Verified:** 2026-03-03

---

## 1. What's Fully Working

- Two session modes (tutor, exam) + Quick Practice route (stateless, filters-based, no session tracking)
- Session lifecycle: create → answer → navigate → review → end → summary
- In-run question navigation (back/jump) in both tutor and exam modes via Question Navigator grid
- Per-question session summary with explanations
- Bookmark toggle on question view
- Dashboard stats with session context (grouping by session), attempt-specific review links (active secrecy hardening tracked in BUG-191/BUG-192/BUG-193)
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

## 2. Open Debt and Active Bugs (Practice-Specific)

- **BS-014:** Practice Starter — Silent truncation when fewer questions match than requested count (no spec yet)
- **DEBT-268:** Quick Practice ordering-policy alignment — apply daily-seeded candidate shuffle before `selectNextQuestionId` in filter mode
- **BUG-189 (P2):** Question review cross-slug async state corruption
- **BUG-190 (P3):** History session reopen race applies stale result
- **BUG-191 (P2):** `GetNextQuestion` leaks `latestIsCorrect` for active exam sessions
- **BUG-192 (P2):** History page attempted-questions view exposes active-exam correctness
- **BUG-193 (P3):** `SubmitAnswer` returns `isCorrect` for active exam submits
- **BUG-194 (P3):** Practice submit flow missing stale-request guard
- **Recently fixed on branch `bug-fix-186-187-188`:** BUG-186, BUG-187, BUG-188 (pending archive)
- Canonical invariant source: [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md)

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
| **Session review retry ownership** | Inline retry for ended sessions is owned by `/app/questions/[slug]?mode=review&sessionId=...`; active session runner remains `/app/practice/[sessionId]`. | Retry Logic SSOT §3 |
| **Session immutability on retry** | Retry attempts are standalone writes (`practiceSessionId = null`); historical session score/question states are never mutated. | Retry Logic SSOT §1, §6 |
| **Session-review retried marker persistence** | `wasRetried` is intentionally visit-scoped (no cross-visit persistence requirement in current contract). | DEBT-266 |
