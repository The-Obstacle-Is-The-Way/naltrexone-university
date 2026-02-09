# SPEC-019: Practice & Navigation UX Redesign

> **Status:** Partial (Phase 4 pending)
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
├── [Section] Incomplete Session       (if exists — resume/abandon)
├── [Card 1] "Start a Session" (Primary CTA)
│   └── Configure: mode, count, tags, difficulty
│   └── "Start" → /app/practice/[sessionId]
├── [Card 2] "Quick Practice" (Secondary CTA)
│   └── "Answer questions without session tracking"
│   └── → /app/practice/quick
└── [Section] Recent Sessions
    └── List of past sessions with scores + "View breakdown"

/app/practice/[sessionId]             ← SESSION RUNNER (immersive, unchanged)
├── Header: "Tutor Mode • 3/20"       [End Session]
├── Question Navigator (numbered grid)
├── Question + Choices + Bookmark toggle
├── Submit → Feedback (tutor) or Stored (exam)
├── Mark for Review (exam only)
├── "Next" → advance
├── Exam Review Stage → answered/unanswered/marked grid
└── After finalize → Summary (totals + per-question breakdown)

/app/practice/quick                   ← QUICK PRACTICE (no session)
├── Header: "Quick Practice"          [← Back to Practice]
├── Random question (no session tracking)
├── Submit → Feedback immediately + Bookmark toggle
└── "Next Question" or "Back to Practice"
```

> **Route note:** The session runner route remains `/app/practice/[sessionId]` (existing, NOT `/app/practice/sessions/[id]`). Since `[sessionId]` is always a UUID and `quick` is a static segment, Next.js resolves `/app/practice/quick` statically before the dynamic `[sessionId]` catch — no collision possible.

### 5.3 Mode Comparison Table

| Aspect | Quick Practice | Tutor Session | Exam Session |
|--------|----------------|---------------|--------------|
| **Route** | `/app/practice/quick` | `/app/practice/[sessionId]` | `/app/practice/[sessionId]` |
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

**Product Decision (2026-02-09):** Review = **missed-only**. The `/app/review` page shows only questions whose most recent attempt is incorrect (per SPEC-014). This is NOT an "all questions" library. Rationale: missed-only review is the highest-value remediation workflow for board prep; an "all answered" view is lower priority and can be added later as a separate feature if needed.

**UI clarifications to implement:**

1. **Keep "Review" in nav** but update the page subtitle to: _"Questions you answered incorrectly — review and reattempt to strengthen weak areas."_
2. **Empty state messaging:** When no missed questions exist, show:

   ```text
   No missed questions yet.
   Great work! As you practice, any questions you get wrong will appear here for review.
   [Go to Practice →]
   ```

3. **Add filtering (P2):** Allow filtering missed questions by tag, difficulty, date range
4. **Session origin (Done):** Each missed question already shows session origin badge (`Tutor session`, `Exam session`, or `Ad-hoc practice`) via SPEC-020 Phase 3

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

**Goal:** Clear separation between quick practice and sessions. No question loads until the user explicitly chooses a mode.

#### 6.2.1 Route Changes

| Route | Before | After |
|-------|--------|-------|
| `/app/practice` | Landing + ad-hoc question flow on same page | **Landing page only** — mode selection + session history |
| `/app/practice/quick` | Does not exist | **New** — ad-hoc question flow (random question, immediate feedback) |
| `/app/practice/[sessionId]` | Session runner | **Unchanged** |

Add to `lib/routes.ts`:
```typescript
APP_PRACTICE_QUICK: '/app/practice/quick',
```

#### 6.2.2 Landing Page Refactor (`/app/practice`)

**What changes:** Remove the ad-hoc question flow (`usePracticeQuestionFlow`, `PracticeView`). The landing page becomes a pure decision point.

**Layout (top to bottom):**

```text
┌────────────────────────────────────────────────────────────┐
│ Practice                                [Back to Dashboard] │
│ Choose how you want to practice.                            │
├────────────────────────────────────────────────────────────┤
│ ┌─ Incomplete Session Card (if exists) ─────────────────┐  │
│ │ Tutor · 5/20 answered     [Resume session] [Abandon]  │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌─ Start a Session ──────────┐  ┌─ Quick Practice ────────┐ │
│ │ Structured practice with   │  │ Answer one question at  │ │
│ │ progress tracking.         │  │ a time. No session      │ │
│ │                            │  │ tracking — just jump    │ │
│ │ Mode: [Tutor] [Exam]      │  │ in and practice.        │ │
│ │ Questions: [20]            │  │                         │ │
│ │ Difficulty: [E] [M] [H]   │  │                         │ │
│ │ ▶ Exam Section (0)         │  │                         │ │
│ │ ▶ Substance (0)            │  │                         │ │
│ │ ▶ Topic (0)                │  │                         │ │
│ │ ▶ Treatment (0)            │  │                         │ │
│ │                            │  │                         │ │
│ │ [Start session]            │  │ [Quick Practice →]      │ │
│ └────────────────────────────┘  └─────────────────────────┘ │
│                                                              │
│ ┌─ Recent Sessions ─────────────────────────────────────┐   │
│ │ Tutor · 1/20 correct (100%) · 1m 20s  [View breakdown]│   │
│ │ Tutor · 0/20 correct (0%) · 31s       [View breakdown]│   │
│ └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Responsive:** On mobile, the two mode cards stack vertically (Session on top, Quick Practice below).

**Component reuse:**
- `IncompleteSessionCard` — unchanged, stays on landing page
- `PracticeSessionStarter` — unchanged, embedded in "Start a Session" card
- `PracticeSessionHistoryPanel` — unchanged, stays on landing page
- `PracticeView` — **removed from landing page**, moves to quick practice page

**Hook reuse:**
- `usePracticeSessionControls` — stays (orchestrates starter + incomplete + history + tags)
- `usePracticeSessionStart` — stays
- `usePracticeSessionTags` — stays
- `usePracticeIncompleteSession` — stays
- `usePracticeSessionHistory` — stays
- `usePracticeQuestionFlow` — **removed from landing page** (moves to quick practice)
- `usePracticeQuestionBookmarks` — **removed from landing page** (moves to quick practice)

**Files to modify:**
- `app/(app)/app/practice/page.tsx` — remove question flow, keep session controls only
- `app/(app)/app/practice/practice-page-client.tsx` — remove question flow orchestration
- `app/(app)/app/practice/components/practice-view.tsx` — small additive change: allow `title`/`description`/`backLink` overrides for Quick Practice reuse (defaults preserve existing output)
- `lib/routes.ts` — add `APP_PRACTICE_QUICK`

#### 6.2.3 Quick Practice Page (`/app/practice/quick`)

**New route** that houses the ad-hoc question flow currently living on `/app/practice`.

**Layout:**

```text
┌────────────────────────────────────────────────────────────┐
│ Quick Practice                          [← Back to Practice]│
│ Answer one question at a time.                              │
├────────────────────────────────────────────────────────────┤
│                                              [Bookmark]     │
│ ┌─ Question Card ──────────────────────────────────────┐   │
│ │ A patient who had been taking zolpidem nightly...     │   │
│ │                                                       │   │
│ │ (A) Choice A                                          │   │
│ │ (B) Choice B                                          │   │
│ │ (C) Choice C                                          │   │
│ │ (D) Choice D                                          │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                              │
│ [Submit]  [Next Question]                                    │
│                                                              │
│ (After submit: feedback + explanation shown immediately)     │
└──────────────────────────────────────────────────────────────┘
```

**Component reuse:**
- `PracticeView` — reused as-is (renders question card + feedback + submit + next)
- `QuestionCard` — reused (shared component)
- `Feedback` — reused (shared component)
- `ErrorCard` — reused for error states

**Hook reuse:**
- `usePracticeQuestionFlow` — reused as-is (composite hook for question fetch + answer + next)
- `usePracticeQuestionBookmarks` — reused as-is
- `shared/question-flow-actions.ts` — reused (shared actions for question fetch/submit)
- `shared/use-question-flow-core.ts` — reused (shared core hook)

**New files to create:**
- `app/(app)/app/practice/quick/page.tsx` — server component, renders `QuickPracticeClient`
- `app/(app)/app/practice/quick/quick-practice-client.tsx` — client component, composes hooks + view
- `app/(app)/app/practice/quick/loading.tsx` — loading state (consistent with practice/loading.tsx)
- `app/(app)/app/practice/quick/error.tsx` — error boundary (consistent with practice/error.tsx)

**What `QuickPracticeClient` does:**
```text
1. Calls usePracticeQuestionFlow() — fetches random question on mount (composes answer flow + bookmark state)
2. Renders PracticeView with title "Quick Practice" and a "Back to Practice" link
3. No session controls, no progress counter, no session history
```

#### 6.2.4 Implementation Order

| Step | Task | Priority | Depends On |
|------|------|----------|-----------|
| 1 | Add `APP_PRACTICE_QUICK` to `lib/routes.ts` | P1 | — |
| 2 | Create `/app/practice/quick/` route files (page, client, loading, error) | P1 | Step 1 |
| 3 | Wire quick practice page to reuse `usePracticeQuestionFlow` + `PracticeView` | P1 | Step 2 |
| 4 | Remove question flow from `/app/practice/practice-page-client.tsx` | P1 | Step 3 (quick page works first) |
| 5 | Update landing page layout: add "Quick Practice" card with link | P1 | Step 4 |
| 6 | Update tests for landing page (no longer renders question flow) | P1 | Step 4 |
| 7 | Add tests for quick practice page | P1 | Step 3 |

**Acceptance Criteria for Phase 2:**
- [x] `/app/practice` does NOT load any question on mount — only shows session controls + history
- [x] `/app/practice` shows two clear mode options: "Start a Session" card + "Quick Practice" card
- [x] `/app/practice/quick` loads a random question on mount, allows submit → feedback → next
- [x] `/app/practice/quick` has "Back to Practice" link and page heading
- [x] `/app/practice/[sessionId]` is unchanged (no regressions)
- [x] `ROUTES.APP_PRACTICE_QUICK` exists in `lib/routes.ts`
- [x] All existing practice page tests pass (updated for new layout)
- [x] New tests cover quick practice page rendering and question flow
- [x] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` all pass

### Phase 3: Cross-Page Information Architecture

**Goal:** Make all pages actionable and coherent across the app.

| Task | Priority | Status | Section |
|------|----------|--------|---------|
| Dashboard: group activity by session with mode badge + score | P1 | **Done** (SPEC-020 Phase 3) | 5.4.1 |
| Review page: show session origin per missed question | P2 | **Done** (SPEC-020 Phase 3) | 5.4.3 |
| Dashboard: make recent activity items clickable links → `/app/questions/[slug]` | P1 | **Done** | 5.4.1 |
| Dashboard: render difficulty badge on activity items | P2 | **Done** | 5.4.1 |
| Dashboard: session headers link to session detail/breakdown | P2 | **Done** | 5.4.1 |
| Tag filter: implement collapsible categories (Option A) | P1 | **Done** | 5.4.2 |
| Tag filter: show active filter count badges on collapsed headers | P2 | **Done** | 5.4.2 |
| Review page: update subtitle to clarify missed-only scope | P1 | **Done** | 5.4.3 |
| Review page: update empty state with helpful messaging + CTA | P1 | **Done** | 5.4.3 |
| Review page: add tag/difficulty filter to missed questions list | P2 | **Done** | 5.4.3 |
| Cross-page: make every question reference a clickable link → `/app/questions/[slug]` | P1 | **Partial** — Practice session breakdowns (history panel + summary) still non-interactive; see Phase 4 | 5.4.4 |
| Cross-page: origin-aware back links on `/app/questions/[slug]` (adapt to entry point) | P2 | **Done** | 5.4.4 |
| Cross-page: improve empty states on all pages with CTAs | P2 | **Done** | 5.4.4 |

**Acceptance Criteria for Phase 3:**
- [x] Dashboard sessions are grouped with mode badge and score summary
- [x] Missed questions show session origin (mode + date) when applicable
- [x] Dashboard recent activity items are clickable → navigate to question review
- [x] Dashboard renders difficulty badge on activity items
- [x] Tag filter categories are collapsed by default; expanding shows chips
- [x] Active filter count shown on collapsed categories
- [x] Review page subtitle clarifies scope: _"Questions you answered incorrectly — review and reattempt to strengthen weak areas."_
- [x] Review page empty state explains scope and provides CTA
- [ ] All question references across all pages are clickable links *(Practice session breakdowns are still non-interactive — see Phase 4)*
- [x] Question detail page back links adapt to entry point (Dashboard, Review, Bookmarks, Practice)
- [x] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` all pass

**Dependencies:** Phase 3 can proceed independently of Phase 2. Many tasks require only UI changes (no backend work). Session grouping and origin badges are already done via SPEC-020 Phase 3.

---

## 7. Files to Create/Modify

### Phase 1 (Bug Fixes)
- `scripts/seed.ts` — verify seeding published questions
- `src/adapters/controllers/action-result.ts` — improve error messages
- `app/(app)/app/practice/page.tsx` — better error display

### Phase 2 (Redesign)
- `lib/routes.ts` — add `APP_PRACTICE_QUICK`
- `app/(app)/app/practice/page.tsx` — remove question flow rendering
- `app/(app)/app/practice/practice-page-client.tsx` — remove question flow orchestration, add "Quick Practice" card
- `app/(app)/app/practice/quick/page.tsx` — NEW: server component renders `QuickPracticeClient`
- `app/(app)/app/practice/quick/quick-practice-client.tsx` — NEW: client component composing `usePracticeQuestionFlow` + `PracticeView`
- `app/(app)/app/practice/quick/loading.tsx` — NEW: loading state
- `app/(app)/app/practice/quick/error.tsx` — NEW: error boundary

### Phase 3 (Cross-Page IA)
- `app/(app)/app/dashboard/page.tsx` — make activity clickable, add session grouping
- `app/(app)/app/practice/components/practice-session-starter.tsx` — collapsible tag categories
- `app/(app)/app/review/page.tsx` — subtitle, filters, empty state, session origin
- `app/(app)/app/bookmarks/page.tsx` — improve empty state
- `app/(app)/app/questions/[slug]/page.tsx` — pass origin search param through to client
- `app/(app)/app/questions/[slug]/question-page-client.tsx` — origin-aware back links + subtitle
- `lib/routes.ts` — support `toQuestionRoute(slug, { from })`
- `src/application/use-cases/get-missed-questions.ts` — include `tagSlugs` for review filtering

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
│ /app/practice/[sessionId]     │   │ /app/practice/quick           │
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

## 14. Implementation Status (2026-02-09)

### Phase 1: Stabilize Current Implementation — **Done**

All Phase 1 acceptance criteria met:
- Database seeded with published questions
- Session creation, progress, and summary all functional
- Tutor mode shows explanations immediately
- Exam mode hides explanations until session end
- Error messages improved via `ApplicationError` typed codes

### Phase 2: UX Redesign — **Done**

All Phase 2 acceptance criteria met:
- `/app/practice` is now a landing page only (session controls + history; no ad-hoc question flow)
- `/app/practice/quick` exists and renders the ad-hoc question flow (reuses existing hooks + components)
- `ROUTES.APP_PRACTICE_QUICK` added to `lib/routes.ts`
- "Quick Practice" entry point added to app navigation (desktop + mobile)

**Summary of changes:**
1. Create `/app/practice/quick/` route (reuses existing `usePracticeQuestionFlow` + `PracticeView`)
2. Remove ad-hoc question flow from `/app/practice` landing page
3. Add "Quick Practice" card to landing page with link to new route
4. Add `APP_PRACTICE_QUICK` to `lib/routes.ts`

### Phase 3: Cross-Page Information Architecture — **Done**

**Completed** via SPEC-020 Phase 3:
- Dashboard groups activity by `sessionId` / `sessionMode` ✓
- Review rows display session origin (`Tutor session`, `Exam session`, `Ad-hoc practice`) ✓

**Completed** via SPEC-019 Phase 3:
- Dashboard recent activity items are clickable links to question detail (`/app/questions/[slug]?from=dashboard`), show difficulty badges, and session headers link to session detail.
- Practice tag filters use collapsible categories with active selection counts.
- Review page subtitle and empty state clarify missed-only scope; tag/difficulty filters added.
- Bookmarks empty state provides a clear CTA; question stems in Review/Bookmarks are clickable.
- Question detail back links and subtitle adapt based on origin (`?from=dashboard|review|bookmarks|practice`).

**Verification:** `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` all pass.

---

## 15. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-02-05 | Architecture Review | Initial draft |
| 2026-02-06 | Architecture Review | Add SPEC-020 cross-references; session history now formally specified in SPEC-020 Phase 4 |
| 2026-02-07 | Architecture Review | **Major amendment:** Added cross-page UX audit (Section 2.5) — dashboard activity not actionable, tag filter cognitive overload, review page ambiguity, fragmented IA. Introduced Phase 3 (Section 5.4 + Implementation Plan) for cross-page information architecture, including tag filter progressive disclosure design. Included SPEC-014/015 in Related Documents. |
| 2026-02-07 | Architecture Review | **Status:** "Proposed" → "Partial" (Phase 1 Done). Added Section 14 (Implementation Status) with per-phase tracking. Added specific audit findings for Phase 3 gaps: clickable dashboard activity, origin-aware question-detail navigation, question detail subtitle, difficulty badges, cross-links between Review/Bookmarks. |
| 2026-02-07 | Engineering | Updated Phase 3 status to **In Progress (Partial)** to reflect completed session-context work (dashboard grouping + review session-origin badges). Refined navigation gap language to match current `question-page-client` behavior. |
| 2026-02-09 | Engineering | **Phase 2 fully specified.** Expanded Section 6.2 with component-level detail: route structure, landing page layout, quick practice page spec, hook/component reuse mapping, implementation order, file paths. Fixed stale route paths (`/app/practice/sessions/[id]` → `/app/practice/[sessionId]` to match actual codebase). **Product decision:** Review = missed-only (SPEC-014 unchanged, clarify via subtitle). Updated Phase 3 task table with Done/Pending status. Updated Section 14 status from "Not Started" to "Ready for Implementation". |
| 2026-02-09 | Engineering | **Phase 2 implemented.** Added `/app/practice/quick`, refactored `/app/practice` into a decision-point landing page, added `ROUTES.APP_PRACTICE_QUICK`, and exposed Quick Practice in app navigation. |
| 2026-02-09 | Engineering | **Phase 3 implemented.** Made dashboard activity actionable (question links + difficulty badges + session drill-down), added progressive tag filter disclosure, clarified Review scope (subtitle + empty state + filters), made question detail origin-aware via `?from=`, and improved empty states with CTAs. |
| 2026-02-09 | Architecture Review | **Phase 4 added.** Post-implementation UX audit found: (1) Practice session breakdowns (history panel + post-session summary) render questions as non-interactive text while every other page has clickable links — violates Phase 3 cross-linking rule. Root cause: `PracticeSessionReviewRow` lacks `slug` field. (2) Quick Practice card on Practice page is redundant (QP has its own nav tab). (3) Breakdown toggle is stuck-open (no collapse). Added Phase 4 to resolve. Corrected Phase 3 status from Done to Partial. See `docs/brainstorming/practice-ux-audit.md` for full analysis. |

---

## Phase 4: Practice Page Polish (2026-02-09)

### 4.1 Problem Statement

Post-implementation UX audit (see `docs/brainstorming/practice-ux-audit.md`) revealed three issues on the Practice page that weren't caught in Phase 3 acceptance testing:

1. **Session breakdown questions are non-interactive dead ends.** The `PracticeSessionHistoryPanel` (recent sessions) and `SessionSummaryView` (post-session) render question lists as plain `<li>` text with no links. Every other page (Dashboard, Review, Bookmarks) makes question references clickable. This violates the Phase 3 cross-linking rule (Section 5.4.4). Root cause: `PracticeSessionReviewRow` does not include `slug`, which is required by `toQuestionRoute()`.

2. **Quick Practice card on Practice page is redundant.** Quick Practice has its own nav tab (`/app/practice/quick`). The card on the Practice page consumes 50% of the page width for a single CTA button. Removing it lets the session starter use the full width.

3. **Breakdown toggle is stuck-open.** Clicking "View breakdown" opens the question list. Clicking the same button again (now labeled "Refresh breakdown") re-fetches data instead of collapsing. There's no way to close the breakdown once opened.

### 4.2 Solution

#### 4.2.1 Backend: Add `slug` to `PracticeSessionReviewRow`

Add `slug: string` to the `AvailablePracticeSessionReviewRow` type and populate it from the question entity in `GetPracticeSessionReviewUseCase`.

**Type change:**
```typescript
export type AvailablePracticeSessionReviewRow = {
  isAvailable: true;
  questionId: string;
  slug: string;           // ← ADD
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  order: number;
  isAnswered: boolean;
  isCorrect: boolean | null;
  markedForReview: boolean;
};
```

**Blast radius:** Additive-only. All existing consumers use the `isAvailable` discriminated union and will gain `slug` for free. Zero breaking changes.

#### 4.2.2 Frontend: Extract `SessionBreakdownList` Shared Component

The breakdown rendering JSX is duplicated identically in `PracticeSessionHistoryPanel` and `SessionSummaryView`. Extract a shared `SessionBreakdownList` component that:
- Accepts `rows: PracticeSessionReviewRow[]`
- Renders each available question as a `<Link>` → `/app/questions/[slug]?from=practice`
- Renders unavailable questions as plain text `[Question no longer available]`
- Shows order number, answered/unanswered status, correct/incorrect label

#### 4.2.3 Frontend: Remove Quick Practice Card

Remove the `QuickPracticeCard` from `practice-page-client.tsx` and the 2-column grid layout. The session starter fills the full page width. Quick Practice remains accessible via its own nav tab.

#### 4.2.4 Frontend: Toggle Breakdown Collapse

In `usePracticeSessionHistory.ts`: if `selectedSessionId === sessionId` on click, set `selectedSessionId = null` (collapse). Update button label to "Hide breakdown" when expanded.

### 4.3 Files to Change

| File | Change |
|------|--------|
| `src/application/use-cases/get-practice-session-review.ts` | Add `slug` to type + enrichment map |
| `app/(app)/app/practice/components/session-breakdown-list.tsx` | **NEW** — shared breakdown component with `<Link>` navigation |
| `app/(app)/app/practice/components/session-breakdown-list.test.tsx` | **NEW** — unit tests |
| `app/(app)/app/practice/components/practice-session-history-panel.tsx` | Import `SessionBreakdownList`, replace inline breakdown JSX |
| `app/(app)/app/practice/hooks/use-practice-session-history.ts` | Toggle logic: collapse on re-click |
| `app/(app)/app/practice/practice-page-client.tsx` | Remove `QuickPracticeCard`, full-width session starter |
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | Import `SessionBreakdownList`, replace inline breakdown JSX |
| Existing test files | Update assertions for new link behavior, toggle, and layout changes |

### 4.4 Acceptance Criteria

- [ ] `PracticeSessionReviewRow` (available variant) includes `slug: string`
- [ ] Practice page session breakdown questions are clickable → `/app/questions/[slug]?from=practice`
- [ ] Session summary breakdown questions are clickable → `/app/questions/[slug]?from=practice`
- [ ] Unavailable questions in breakdowns render `[Question no longer available]` with no link
- [ ] `SessionBreakdownList` is a shared component used by both history panel and session summary
- [ ] Quick Practice card is removed from Practice page; session starter fills full width
- [ ] Quick Practice nav tab and `/app/practice/quick` route are unchanged
- [ ] Clicking "View breakdown" toggles: open on first click, close on second click
- [ ] Button label: "View breakdown" (collapsed) / "Hide breakdown" (expanded)
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` all pass
