# SPEC-019: Practice UX Redesign

> **Status:** Proposed
> **Layer:** Feature
> **Date:** 2026-02-05
> **Author:** Architecture Review

---

## 1. Executive Summary

The current practice flow implementation is **functionally correct** but **UX-confusing**. Both ad-hoc ("one question at a time") and session-based (tutor/exam mode) practice are presented on the same page (`/app/practice`), creating ambiguity about which mode the user is in.

This spec proposes a **phased approach**:
1. **Phase 1:** Fix current implementation bugs (database seeding, error handling)
2. **Phase 2:** Redesign UX to clearly separate practice modes

---

## 2. Problem Statement

### 2.1 Current Architecture

```text
/app/practice                         ← Single page, BOTH modes
├── [Top] PracticeSessionStarter      ← Configure mode/count/tags/difficulty
│   └── "Start session" button        ← Creates session → redirects
│
└── [Bottom] Ad-hoc Practice          ← "Answer one question at a time"
    ├── Question loads on mount
    ├── Submit → feedback
    └── "Next Question" → random next

/app/practice/[sessionId]             ← Dedicated session runner
├── Progress (3/20)
├── Tutor/Exam rules
└── Summary after "End session"
```

### 2.2 User Confusion Points

| Issue | Impact |
|-------|--------|
| Both modes on same page | User unsure if they're "in a session" or not |
| Question loads immediately | User sees a question before choosing to start a session |
| No visual separation | Session config and live question compete for attention |
| Ad-hoc has no clear branding | "One question at a time" feels like a leftover, not a feature |

### 2.3 Comparison to Industry Standards

Professional medical question banks (UWorld, Amboss, Kaplan, MKSAP) use clear separation:

| App | Landing Page | Session Config | Session Runner |
|-----|--------------|----------------|----------------|
| **UWorld** | Decision point (no questions shown) | Modal/dedicated page | Full-screen, immersive |
| **Amboss** | Topic browser | Inline or modal | Dedicated page |
| **Kaplan** | Dashboard with stats | Modal | Full-screen |
| **Current** | Questions shown immediately | Inline on same page | Dedicated page ✓ |

### 2.4 Spec Gap Analysis

| Spec | What It Defined | What It Missed |
|------|-----------------|----------------|
| SPEC-012 (Core Question Loop) | Ad-hoc fetch with filters | How ad-hoc should be presented in UI |
| SPEC-013 (Practice Sessions) | Session lifecycle + tutor/exam | How sessions should be presented vs ad-hoc |
| Neither | — | Page architecture, user flow between modes |

**Conclusion:** The backend is correctly implemented per specs. The gap is in **presentation layer design**.

---

## 3. Current State: What Works

The following components are **correctly implemented** and should be preserved:

### 3.1 Domain Layer ✓
- `PracticeSession` entity with immutable `questionIds`
- `PracticeMode` value object (`'tutor' | 'exam'`)
- Grading service respects session mode for explanation visibility

### 3.2 Application Layer ✓
- `StartPracticeSessionUseCase` - creates session with filters
- `GetNextQuestionUseCase` - supports both session and ad-hoc modes (union type)
- `SubmitAnswerUseCase` - gates explanations in exam mode
- `EndPracticeSessionUseCase` - computes summary stats

### 3.3 Adapters Layer ✓
- `startPracticeSession` controller - validates, rate-limits, creates session
- `getNextQuestion` controller - handles both modes via Zod union
- `submitAnswer` controller - respects session explanation rules
- `endPracticeSession` controller - returns summary

### 3.4 Session Runner (`/app/practice/[sessionId]`) ✓
- Progress indicator (X/N)
- Exam mode explanation gating
- "End session" → summary view
- Bookmark toggle

---

## 4. Current Bug: "An unexpected response was received from the server"

### 4.1 Root Cause (Highest Probability)

**No published questions in database.**

Flow:
1. Click "Start session"
2. `StartPracticeSessionUseCase.execute()` calls `questions.listPublishedCandidateIds()`
3. Query: `SELECT id FROM questions WHERE status = 'published'`
4. If zero rows → throws `ApplicationError('NOT_FOUND', 'No questions found')`
5. Error returns to client as action result
6. UI shows generic "unexpected response" message

### 4.2 Verification

```bash
# Check if questions exist and their status
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM questions GROUP BY status;"
```

Expected output should show `published | N` where N > 0.

### 4.3 Fix

```bash
pnpm db:migrate
pnpm db:seed
```

The seed script reads `content/questions/**/*.mdx` and creates questions with `status: 'published'`.

### 4.4 Secondary Causes

| Cause | Symptom | Fix |
|-------|---------|-----|
| User not subscribed | `UNSUBSCRIBED` error | Complete Stripe checkout in test mode |
| Rate limited | `RATE_LIMITED` error | Wait or check `START_PRACTICE_SESSION_RATE_LIMIT` |
| Database connection | `INTERNAL_ERROR` | Check `DATABASE_URL` in `.env.local` |
| Filter mismatch | `NOT_FOUND` | Try with no tag/difficulty filters |

---

## 5. Proposed Redesign

### 5.1 Design Principles

Following Uncle Bob's principles:

1. **Single Responsibility:** Each page does ONE thing
2. **Separation of Concerns:** Decision-making separate from execution
3. **Clear Mental Model:** User always knows which mode they're in

### 5.2 Proposed Page Architecture

```text
/app/practice                         ← LANDING PAGE (decision point)
├── Hero: "Practice Mode"
├── [Card 1] "Start a Session" (Primary CTA)
│   └── Configure: mode, count, tags, difficulty
│   └── "Start" → /app/practice/sessions/[id]
├── [Card 2] "Quick Practice" (Secondary CTA)
│   └── "Answer questions without session tracking"
│   └── → /app/practice/quick
└── [Section] Recent Sessions (optional)
    └── List of past sessions with scores

/app/practice/sessions/[id]           ← SESSION RUNNER (immersive)
├── Header: "Tutor Mode • 3/20"       [End Session]
├── Question + Choices
├── Submit → Feedback (tutor) or Stored (exam)
├── "Next" → advance
└── After all questions OR "End Session" → Summary

/app/practice/quick                   ← QUICK PRACTICE (no session)
├── Header: "Quick Practice"          [Back to Practice]
├── Random question (filters optional)
├── Submit → Feedback immediately
└── "Another Question" or "Done"
```

### 5.3 Mode Comparison Table

| Aspect | Quick Practice | Tutor Session | Exam Session |
|--------|----------------|---------------|--------------|
| **Route** | `/app/practice/quick` | `/app/practice/sessions/[id]` | `/app/practice/sessions/[id]` |
| **Progress tracking** | No | Yes (X/N) | Yes (X/N) |
| **Explanation timing** | Immediate | Immediate | After session ends |
| **Question selection** | Random, no commitment | Fixed at start | Fixed at start |
| **Summary at end** | No | Yes | Yes |
| **Attempts recorded** | Yes | Yes | Yes |
| **Use case** | Quick review, warming up | Learning mode | Exam simulation |

### 5.4 Tutor vs Exam Mode Clarification

Per SPEC-013 and master_spec.md section 4.5.4:

| Mode | Explanation Visibility | User Feedback | Mental Model |
|------|------------------------|---------------|--------------|
| **Tutor** | Shown immediately after submit | Correct/incorrect + explanation | "Learning mode" - study as you go |
| **Exam** | Hidden until `endPracticeSession` | Just stored, no feedback until end | "Test mode" - simulate real exam |

**Implementation already correct in:**
- `SubmitAnswerUseCase` line 55: `explanationMd = session?.mode === 'exam' && !session.endedAt ? null : question.explanationMd`
- `practice-session-page-client.tsx`: respects `submitResult.explanationMd` being null

---

## 6. Implementation Plan

### Phase 1: Stabilize Current Implementation (PREREQUISITE)

**Goal:** Get current flow working 100% before refactoring.

| Task | Priority | Effort |
|------|----------|--------|
| Seed database with published questions | P0 | 5 min |
| Verify "Start session" creates session and redirects | P0 | 10 min |
| Verify tutor mode shows explanations immediately | P0 | 5 min |
| Verify exam mode hides explanations until end | P0 | 5 min |
| Verify session summary displays stats | P0 | 5 min |
| Add better error messages (replace "unexpected response") | P1 | 1 hr |

**Acceptance Criteria for Phase 1:**
- [ ] `pnpm db:seed` completes without errors
- [ ] `/app/practice` → "Start session" → redirects to `/app/practice/[sessionId]`
- [ ] Session shows progress (e.g., "1/20")
- [ ] Tutor mode: explanation visible after submit
- [ ] Exam mode: explanation hidden until "End session"
- [ ] "End session" shows summary with answered/correct/accuracy/duration

### Phase 2: UX Redesign

**Goal:** Clear separation between quick practice and sessions.

| Task | Priority | Effort |
|------|----------|--------|
| Create `/app/practice/quick/page.tsx` for ad-hoc mode | P1 | 2 hr |
| Redesign `/app/practice/page.tsx` as landing page | P1 | 2 hr |
| Move session starter to modal or inline card | P2 | 1 hr |
| Add session history section to landing page | P3 | 2 hr |
| Remove ad-hoc question display from landing page | P1 | 30 min |

**Acceptance Criteria for Phase 2:**
- [ ] `/app/practice` shows two clear options: Session vs Quick Practice
- [ ] No question is shown until user explicitly chooses a mode
- [ ] `/app/practice/quick` works independently for ad-hoc practice
- [ ] Session config is prominent and easy to understand
- [ ] User flow matches UWorld/Kaplan mental model

---

## 7. Files to Create/Modify

### Phase 1 (Bug Fixes)
- `scripts/seed.ts` — verify seeding published questions
- `src/adapters/controllers/action-result.ts` — improve error messages
- `app/(app)/app/practice/page.tsx` — better error display

### Phase 2 (Redesign)
- `app/(app)/app/practice/page.tsx` — convert to landing page
- `app/(app)/app/practice/quick/page.tsx` — NEW: ad-hoc practice
- `app/(app)/app/practice/quick/loading.tsx` — NEW
- `app/(app)/app/practice/quick/error.tsx` — NEW
- `components/practice/PracticeLanding.tsx` — NEW: landing page component
- `components/practice/QuickPractice.tsx` — NEW: ad-hoc component
- `components/practice/SessionStarter.tsx` — extract from current page

---

## 8. Non-Functional Requirements

### 8.1 Performance
- Landing page should load in < 500ms (no question fetch on mount)
- Quick practice should fetch question in < 1s
- Session creation should complete in < 2s

### 8.2 Accessibility
- Clear focus indicators for all interactive elements
- Screen reader announcements for mode changes
- Keyboard navigation for all flows

### 8.3 Mobile Responsiveness
- All three pages (landing, quick, session) work on mobile
- Touch-friendly buttons and choices

---

## 9. Testing Strategy

### Unit Tests
- `PracticeLanding.test.tsx` — renders two CTAs correctly
- `QuickPractice.test.tsx` — fetches random question, handles submit
- `SessionStarter.test.tsx` — validates inputs, calls controller

### Integration Tests
- `practice-landing.integration.test.ts` — navigation to quick vs session
- `quick-practice.integration.test.ts` — ad-hoc flow end-to-end

### E2E Tests
- `practice-landing.spec.ts` — user can navigate to both modes
- `quick-practice.spec.ts` — answer question, see feedback, get another
- `practice-session.spec.ts` — (existing) tutor and exam flows

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Refactoring breaks existing session flow | High | Phase 1 stabilizes first; Phase 2 is additive |
| Users confused by new layout | Medium | Clear labels, tooltips, onboarding hints |
| Ad-hoc mode becomes orphaned | Low | Keep visible as "Quick Practice" with clear value prop |

---

## 11. Decision: Fix First, Then Refactor

**Recommendation:** Complete Phase 1 before starting Phase 2.

**Rationale:**
1. Current session flow is architecturally sound but may have bugs
2. Fixing bugs first ensures we understand what's working
3. Refactoring on a broken foundation creates more bugs
4. Phase 1 is fast (< 1 day); Phase 2 is medium (2-3 days)

**Sequence:**
```text
[Current State] → [Phase 1: Fix & Verify] → [Phase 2: Redesign]
     Broken?           Working 100%           Clean UX
```

---

## 12. Related Documents

- [SPEC-012: Core Question Loop](./spec-012-core-question-loop.md)
- [SPEC-013: Practice Sessions](./spec-013-practice-sessions.md)
- [master_spec.md Section 4.5.3-4.5.5](./master_spec.md)
- [ADR-011: Feature Slice Architecture](../adr/adr-011-feature-slices.md)

---

## 13. Appendix: UWorld-Style Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        /app/practice                                │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                     Practice Mode                           │   │
│   │                                                             │   │
│   │     Choose how you want to practice today:                  │   │
│   │                                                             │   │
│   │   ┌─────────────────────┐   ┌─────────────────────┐        │   │
│   │   │                     │   │                     │        │   │
│   │   │   📝 Session        │   │   ⚡ Quick          │        │   │
│   │   │                     │   │                     │        │   │
│   │   │   Structured        │   │   One question      │        │   │
│   │   │   practice with     │   │   at a time,        │        │   │
│   │   │   progress          │   │   no tracking       │        │   │
│   │   │   tracking          │   │                     │        │   │
│   │   │                     │   │                     │        │   │
│   │   │   Mode: Tutor/Exam  │   │   Just jump in      │        │   │
│   │   │   Count: 10-100     │   │   and practice      │        │   │
│   │   │   Tags: Filter      │   │                     │        │   │
│   │   │                     │   │                     │        │   │
│   │   │   [Start Session]   │   │   [Quick Practice]  │        │   │
│   │   │                     │   │                     │        │   │
│   │   └─────────────────────┘   └─────────────────────┘        │   │
│   │                                                             │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │   📊 Recent Sessions                                        │   │
│   │   ├── Tutor • 85% • 20 questions • 2 days ago              │   │
│   │   ├── Exam  • 72% • 15 questions • 5 days ago              │   │
│   │   └── [View all →]                                          │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

                    │                           │
                    ▼                           ▼

┌───────────────────────────────┐   ┌───────────────────────────────┐
│ /app/practice/sessions/[id]   │   │ /app/practice/quick           │
│                               │   │                               │
│ ┌───────────────────────────┐ │   │ Quick Practice    [← Back]    │
│ │ Tutor • 3/20  [End]       │ │   │                               │
│ └───────────────────────────┘ │   │ ┌───────────────────────────┐ │
│                               │   │ │ Question stem...          │ │
│ Question stem...              │   │ │                           │ │
│                               │   │ │ ○ A. Choice A             │ │
│ ○ A. Choice A                 │   │ │ ○ B. Choice B             │ │
│ ● B. Choice B  ✓              │   │ │ ○ C. Choice C             │ │
│ ○ C. Choice C                 │   │ │ ○ D. Choice D             │ │
│ ○ D. Choice D                 │   │ └───────────────────────────┘ │
│                               │   │                               │
│ ┌───────────────────────────┐ │   │ [Submit]                      │
│ │ Explanation: ...          │ │   │                               │
│ └───────────────────────────┘ │   │ After submit:                 │
│                               │   │ ┌───────────────────────────┐ │
│ [Next →]           [🔖]       │   │ │ ✓ Correct! Explanation... │ │
│                               │   │ └───────────────────────────┘ │
└───────────────────────────────┘   │                               │
                                    │ [Another Question] [Done]     │
                                    │                               │
                                    └───────────────────────────────┘
```

---

## 14. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-02-05 | Architecture Review | Initial draft |
