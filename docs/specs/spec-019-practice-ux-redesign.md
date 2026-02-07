# SPEC-019: Practice & Navigation UX Redesign

> **Status:** Partial
> **Layer:** Feature
> **Date:** 2026-02-05 (amended 2026-02-07)
> **Author:** Architecture Review

---

## 1. Executive Summary

The current practice flow implementation is **functionally correct** but **UX-confusing**. Both ad-hoc ("one question at a time") and session-based (tutor/exam mode) practice are presented on the same page (`/app/practice`), creating ambiguity about which mode the user is in. A cross-page UX audit (2026-02-07) revealed additional issues: dashboard activity is not actionable, the tag filter presents 41 simultaneous chips causing cognitive overload, the Review page scope is ambiguous, and user data is fragmented across four tabs with no cross-linking.

This spec proposes a **three-phase approach**:
1. **Phase 1:** Fix current implementation bugs (database seeding, error handling)
2. **Phase 2:** Redesign UX to clearly separate practice modes
3. **Phase 3:** Cross-page information architecture — actionable dashboard, progressive tag filters, review page clarity, unified navigation

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
├── Exam review stage (answered/unanswered/marked + jump)
└── Summary after final exam submit
```

### 2.2 User Confusion Points

| Issue | Impact |
|-------|--------|
| Both modes on same page | User unsure if they're "in a session" or not |
| Question loads immediately | User sees a question before choosing to start a session |
| No visual separation | Session config and live question compete for attention |
| Ad-hoc has no clear branding | "One question at a time" feels like a leftover, not a feature |
| Dashboard activity not actionable | Recent activity shows question text + "Correct" but nothing is clickable — no link to question or session |
| Tag filter cognitive overload | 5 categories × 38 tags + 3 difficulty levels = 41 toggleable chips presented flat on screen; "Treatment & Pharmacotherapy" (exam section) next to "Treatment" (topic) next to specific meds looks redundant |
| Review page ambiguous label | Nav says "Review"; page says "Review questions you've missed" — user with 100% accuracy sees empty page and wonders where their questions went |
| No cross-page coherence | User data fragmented: attempts on Dashboard, sessions on Practice, missed on Review, saved on Bookmarks — no unified "my questions" view |

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

### 2.5 Cross-Page UX Audit (2026-02-07)

A live-app walkthrough revealed issues that extend beyond the Practice page into the broader information architecture.

#### 2.5.1 Dashboard — Recent Activity Is Not Actionable

**Current state:** The "Recent activity" section shows truncated question stems with a "Correct"/"Incorrect" label. Nothing is clickable.

**What users expect:** Tap a question to review it. Tap a session to see the breakdown. This is standard in UWorld (click any question in performance tab to re-review).

**Impact:** The dashboard becomes a dead-end — users see stats but can't act on them.

#### 2.5.2 Tag Filter — Cognitive Overload

**Current state:** The practice session starter presents ALL 38 tags across 5 categories as flat toggleable chips:

```text
Difficulty:      Easy | Medium | Hard                               (3)
Exam Section:    Co-occurring... | Epidemiology... | Ethics... | ... (8)
Substance:       Alcohol | Cannabis | Cocaine | ...                 (10)
Topic:           Comorbidity | Diagnosis | Epidemiology | ...       (17)
Treatment:       Buprenorphine | Naloxone | Naltrexone              (3)
                                                          Total:    41 chips
```

**The redundancy perception problem:** The underlying taxonomy is NOT actually redundant — each kind serves a distinct purpose:

| Kind | Purpose | Example |
|------|---------|---------|
| `domain` (Exam Section) | Board exam blueprint section | "Treatment & Pharmacotherapy" |
| `topic` | Clinical concept | "Treatment", "Pharmacology" |
| `substance` | Drug class | "Opioids", "Alcohol" |
| `treatment` | Specific medication | "Naltrexone", "Buprenorphine" |

But **users don't see the taxonomy** — they see "Treatment" in three different places and assume redundancy. The data model is sound; the **presentation** needs progressive disclosure.

**Industry comparison:** UWorld uses a two-level filter: select subjects first, then topics within each subject. Amboss uses a search bar with autocomplete. Neither shows 41 simultaneous toggles.

#### 2.5.3 Review Page — Ambiguous Scope

**Current state:** The "Review" tab shows only questions the user answered incorrectly. The heading says "Review questions you've missed."

**Problem:** The nav label "Review" doesn't communicate this scope. A user who answered all questions correctly sees an empty page with no explanation of why it's empty or where to find their answered questions.

**What users expect from "Review":**
- UWorld: "Review" means reviewing completed tests — all questions, with your answers and explanations
- Amboss: "Review" means study mode for content
- Our "Review": means only incorrect questions (more accurately: "Missed Questions")

#### 2.5.4 Information Architecture — Four Tabs, Fragmented Data

Current navigation and data distribution:

```text
Dashboard     Practice       Review          Bookmarks
─────────     ────────       ──────          ─────────
Stats cards   Session form   Missed Q's      Saved Q's
Recent acts   Ad-hoc Q       (incorrect)     (bookmarked)
(read-only)   Recent sessions
              Session history
```

**Gap:** No single page answers "show me all questions I've answered." Data is split across tabs with no cross-linking:
- Dashboard: recent activity (flat, not clickable)
- Practice: recent sessions (clickable, has breakdown)
- Review: only incorrect answers
- Bookmarks: only bookmarked questions

#### 2.5.5 Three Practice Domains Need Clear Separation

The user perceives three distinct practice experiences:
1. **Individual practice** — Answer one random question, see explanation, move on
2. **Tutor mode** — Structured session with immediate feedback
3. **Exam mode** — Structured session with deferred feedback

Currently all three originate from the same Practice page. SPEC-019 Phase 2 already proposes separating Quick Practice from Sessions. This audit confirms that separation is essential.

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
- Exam mode mark/unmark + pre-submit review stage
- Final submit from review → summary view
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

### 5.4 Phase 3 — Cross-Page Information Architecture

#### 5.4.1 Dashboard Improvements

**Make recent activity actionable:**

```text
Recent activity
┌─────────────────────────────────────────────────────────┐
│ Tutor session · 3/5 correct (60%) · 2 min ago          │
│   ├─ Q: "A physician is reviewing the contra..." ✓     │ ← clickable → /app/questions/[slug]
│   ├─ Q: "An elderly patient with insomnia..." ✓        │ ← clickable → /app/questions/[slug]
│   └─ Q: "Which medication is first-line..." ✗          │ ← clickable → /app/questions/[slug]
│                                          [View session →]│ ← links to session detail
├─────────────────────────────────────────────────────────┤
│ Quick practice · Correct · 5 min ago                    │
│   Q: "The mechanism of action of naltrexone..." ✓      │ ← clickable → /app/questions/[slug]
└─────────────────────────────────────────────────────────┘
```

- Session-grouped entries are collapsible with summary header
- Individual questions are clickable links to the question review page
- Session summary links to the session breakdown view

#### 5.4.2 Tag Filter Progressive Disclosure

Replace the flat 41-chip layout with progressive disclosure:

**Option A — Collapsible categories (recommended for v1):**

```text
Difficulty:  [Easy] [Medium] [Hard]           ← always visible (only 3)

▶ Exam Section (0 selected)                   ← collapsed by default
▶ Substance (0 selected)                      ← collapsed by default
▶ Topic (0 selected)                          ← collapsed by default
▶ Treatment (0 selected)                      ← collapsed by default
```

Expanding a category shows its chips. Badge shows count of active filters.

**Option B — Search-first filter (future consideration):**

```text
[🔍 Filter by tag...]                        ← autocomplete search
                                                shows matching tags across all kinds
Active filters: [Opioids ×] [Treatment ×]    ← removable chips
```

#### 5.4.3 Review Page Clarification

1. **Rename in nav:** "Review" → "Missed Questions" (or keep "Review" with subtitle)
2. **Empty state messaging:** When no missed questions exist, show:

   ```text
   No missed questions yet.
   Great work! As you practice, any questions you get wrong will appear here for review.
   [Go to Practice →]
   ```

3. **Add filtering:** Allow filtering missed questions by tag, difficulty, date range
4. **Link back to session:** Each missed question shows which session it came from (if applicable)

#### 5.4.4 Cross-Page Navigation Design

| Page | Primary Role | Actionable Links |
|------|-------------|-----------------|
| **Dashboard** | Motivation + progress overview | Activity items → question review; Sessions → session detail; CTA → Practice |
| **Practice** | Start sessions + history | Session config → runner; History → breakdown; Quick practice → ad-hoc |
| **Review** | Remediate weak areas | Each question → question review page with explanation |
| **Bookmarks** | Personal study list | Each question → question review page; Remove bookmark inline |

**Cross-linking rules:**
- Every question reference anywhere in the app should be clickable → `/app/questions/[slug]`
- Every session reference should link to session detail view
- Empty states always provide a clear CTA to the next logical action

### 5.5 Tutor vs Exam Mode Clarification

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
| Add session history section to landing page (see [SPEC-020](./spec-020-practice-engine-completion.md) Phase 4) | P3 | 2 hr |
| Remove ad-hoc question display from landing page | P1 | 30 min |

**Acceptance Criteria for Phase 2:**
- [ ] `/app/practice` shows two clear options: Session vs Quick Practice
- [ ] No question is shown until user explicitly chooses a mode
- [ ] `/app/practice/quick` works independently for ad-hoc practice
- [ ] Session config is prominent and easy to understand
- [ ] User flow matches UWorld/Kaplan mental model

### Phase 3: Cross-Page Information Architecture

**Goal:** Make all pages actionable and coherent across the app.

| Task | Priority | Effort | Section |
|------|----------|--------|---------|
| Dashboard: make recent activity items clickable links | P1 | 2 hr | 5.4.1 |
| Dashboard: group activity by session with collapsible headers | P1 | 3 hr | 5.4.1 |
| Tag filter: implement collapsible categories (Option A) | P1 | 2 hr | 5.4.2 |
| Tag filter: show active filter count badges | P2 | 1 hr | 5.4.2 |
| Review page: update empty state with helpful messaging | P1 | 30 min | 5.4.3 |
| Review page: add subtitle clarifying scope | P1 | 15 min | 5.4.3 |
| Review page: add tag/difficulty filter to missed questions list | P2 | 2 hr | 5.4.3 |
| Review page: show session origin per missed question | P2 | 1 hr | 5.4.3 |
| Cross-page: ensure every question reference links to `/app/questions/[slug]` | P1 | 2 hr | 5.4.4 |
| Cross-page: ensure every session reference links to session detail | P2 | 1 hr | 5.4.4 |
| Cross-page: improve empty states on all pages with CTAs | P2 | 1 hr | 5.4.4 |

**Acceptance Criteria for Phase 3:**
- [ ] Dashboard recent activity items are clickable → navigate to question review
- [ ] Dashboard sessions are grouped with mode badge and score summary
- [ ] Tag filter categories are collapsed by default; expanding shows chips
- [ ] Active filter count shown on collapsed categories
- [ ] Review page empty state explains scope and provides CTA
- [ ] Missed questions show session origin (mode + date) when applicable
- [ ] All question references across all pages are clickable links
- [ ] All session references link to session detail/breakdown

**Dependencies:** Phase 3 can proceed independently of Phase 2. Many tasks require only UI changes (no backend work). Session origin on missed questions requires the `sessionId`/`sessionMode` fields from SPEC-020 Phase 3.

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

### Phase 3 (Cross-Page IA)
- `app/(app)/app/dashboard/page.tsx` — make activity clickable, add session grouping
- `app/(app)/app/practice/components/practice-session-starter.tsx` — collapsible tag categories
- `app/(app)/app/review/page.tsx` — subtitle, filters, empty state, session origin
- `app/(app)/app/bookmarks/page.tsx` — improve empty state
- `components/ui/collapsible-filter-group.tsx` — NEW: reusable collapsible filter component

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
- `dashboard-activity-links.spec.ts` — clicking activity items navigates to question review
- `tag-filter-collapse.spec.ts` — collapsible categories expand/collapse correctly

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Refactoring breaks existing session flow | High | Phase 1 stabilizes first; Phase 2 is additive |
| Users confused by new layout | Medium | Clear labels, tooltips, onboarding hints |
| Ad-hoc mode becomes orphaned | Low | Keep visible as "Quick Practice" with clear value prop |
| Collapsible filters hide options users need | Medium | Show "N selected" badge; expand by default if filters already active |
| Review page rename confuses returning users | Low | Keep URL `/app/review` unchanged; only update nav label and heading |

---

## 11. Decision: Fix First, Then Refactor

**Recommendation:** Complete Phase 1 before starting Phase 2. Phase 3 can proceed in parallel with Phase 2.

**Rationale:**
1. Current session flow is architecturally sound but may have bugs
2. Fixing bugs first ensures we understand what's working
3. Refactoring on a broken foundation creates more bugs
4. Phase 1 is fast (< 1 day); Phase 2 is medium (2-3 days); Phase 3 is medium (2-3 days)
5. Phase 3 touches different pages (Dashboard, Review, Bookmarks) than Phase 2 (Practice), so they can run in parallel

**Sequence:**

```text
                                    ┌─ [Phase 2: Practice Redesign]
[Current State] → [Phase 1: Fix] → ┤
                                    └─ [Phase 3: Cross-Page IA]
```

---

## 12. Related Documents

- [SPEC-012: Core Question Loop](./spec-012-core-question-loop.md)
- [SPEC-013: Practice Sessions](./spec-013-practice-sessions.md)
- [SPEC-014: Review & Bookmarks](./spec-014-review-bookmarks.md) — defines Review page scope (missed questions only)
- [SPEC-015: Dashboard](./spec-015-dashboard.md) — defines dashboard stats and recent activity
- [SPEC-020: Practice Engine Completion](./spec-020-practice-engine-completion.md) — formally specifies session history (previously P3 optional here), in-run navigation, enriched summary, and session context in existing views
- [master_spec.md Section 4.5.3-4.5.5](./master_spec.md)
- [ADR-001: Clean Architecture Layers](../adr/adr-001-clean-architecture-layers.md)

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

## 14. Implementation Status (2026-02-07)

### Phase 1: Stabilize Current Implementation — **Done**

All Phase 1 acceptance criteria met:
- Database seeded with published questions
- Session creation, progress, and summary all functional
- Tutor mode shows explanations immediately
- Exam mode hides explanations until session end
- Error messages improved via `ApplicationError` typed codes

### Phase 2: UX Redesign — **Not Started**

Primary remaining work. The practice page remains a hybrid combining session config, ad-hoc questions, and session history on one page. The `/app/practice/quick` route does not exist.

### Phase 3: Cross-Page Information Architecture — **In Progress (Partial)**

Part of this phase is complete via SPEC-020 work:
- Dashboard now groups activity by `sessionId` / `sessionMode`.
- Review rows now display session origin (`Tutor session`, `Exam session`, or `Ad-hoc practice`).

Primary remaining work from the live-app audit (2026-02-07):

| Gap | Location | Details |
|-----|----------|---------|
| Dashboard activity not clickable | `app/(app)/app/dashboard/page.tsx` | `slug` is fetched from DB but not used for navigation. `toQuestionRoute(slug)` helper exists in `lib/routes.ts` but is not called. |
| Dashboard difficulty badge missing | Same file | `difficulty` field is fetched in `UserStatsOutput` but not rendered in the UI |
| Origin-aware question-detail navigation missing | `app/(app)/app/questions/[slug]/question-page-client.tsx` | Back links are static (`Back to Dashboard` header link, `Back to Review` post-submit link) and do not adapt to actual entry point (Bookmarks, Dashboard, Practice). |
| Question detail subtitle hard-coded | Same file | Always says "Reattempt a question from your review list" regardless of entry point (bookmarks, dashboard, practice) |
| No cross-links between Review and Bookmarks | `app/(app)/app/review/page.tsx`, `app/(app)/app/bookmarks/page.tsx` | Both pages link to "Go to Practice" but not to each other |
| Tag filter shows 41 flat chips | `app/(app)/app/practice/components/practice-session-starter.tsx` | No progressive disclosure — all categories expanded by default |

These gaps are already specified in Section 5.4 above. No new spec requirements needed — just implementation.

---

## 15. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-02-05 | Architecture Review | Initial draft |
| 2026-02-06 | Architecture Review | Add SPEC-020 cross-references; session history now formally specified in SPEC-020 Phase 4 |
| 2026-02-07 | Architecture Review | **Major amendment:** Add cross-page UX audit (Section 2.5) — dashboard activity not actionable, tag filter cognitive overload, review page ambiguity, fragmented IA. Add Phase 3 (Section 5.4 + Implementation Plan) for cross-page information architecture. Add tag filter progressive disclosure design. Add SPEC-014/015 to Related Documents. |
| 2026-02-07 | Architecture Review | **Status:** "Proposed" → "Partial" (Phase 1 Done). Added Section 14 (Implementation Status) with per-phase tracking. Added specific audit findings for Phase 3 gaps: clickable dashboard activity, origin-aware question-detail navigation, question detail subtitle, difficulty badges, cross-links between Review/Bookmarks. |
| 2026-02-07 | Engineering | Updated Phase 3 status to **In Progress (Partial)** to reflect completed session-context work (dashboard grouping + review session-origin badges). Refined navigation gap language to match current `question-page-client` behavior. |
