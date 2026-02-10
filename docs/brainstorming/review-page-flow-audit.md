# UI/UX Assessment: Review Functionality Distribution

> **Status:** Brainstorming
> **Date:** 2026-02-10
> **Source:** Claude in Chrome extension audit of production app + codebase analysis
> **Scope:** Dashboard, Practice, Review page flows and information architecture

---

## 1. Is Review Functionality Scattered?

**Yes, unambiguously.** But the scattering is worse than surface-level duplication — it creates active navigational confusion.

### What the audit found

The Dashboard's "Recent activity" section doesn't just show question history — each question is a full clickable link to `/app/questions/{id}?from=dashboard`, and each session header (e.g., "TUTOR SESSION") links directly to `/app/practice/{session-uuid}`, routing the user over to the Practice page. So the Dashboard isn't just displaying review content — it's acting as an active navigation hub that routes users to two different pages for what is functionally the same task (reviewing past work).

### Three specific problems

1. **No canonical "where do I go?" answer.** A user who just finished a 20-question exam session and wants to see what they got wrong has to mentally model three possible locations. The Practice page shows the session breakdown with Correct/Incorrect/Unanswered per question. The Review page shows only the missed questions with full text and a reattempt button. The Dashboard shows the same attempts in a timeline. None of these gives the complete picture alone.

2. **The Review page has the narrowest scope despite being the most explicitly named.** It only shows incorrectly answered questions — no session context, no scores, no correct answers, no timeline. A user navigating to "Review" expecting a comprehensive review of their work finds a filtered subset. The page subtitle even says "Questions you answered incorrectly" — which is accurate but sets the wrong expectation for a nav item called "Review."

3. **The Practice page is doing double duty in a way that harms both roles.** Session configuration (future-facing: "what do I want to study next?") and session history (past-facing: "how did I do?") are cognitively opposed tasks. Having the "Recent sessions" section with expandable question breakdowns below the session config form creates a long, scrollable page where the bottom half contradicts the purpose of the top half. During the audit, scrolling past four filter categories and the "Start session" button to reach the session history was significant scroll distance for what is arguably the most important post-session user journey.

---

## 2. Is "Single Responsibility Per Page" the Right Principle?

**Mostly yes, with one important caveat: the Dashboard is a special case.**

The hunch is directionally correct but slightly over-rotated on purity.

A pure analytics dashboard with only stats, charts, and streak data becomes a dead page — you glance at it, note your numbers, and leave. Every successful learning app (Duolingo, Khan Academy, UWorld) includes some form of "recent activity" or "continue where you left off" on their landing page because it serves a critical engagement function: it answers "what did I do last?" and "what should I do next?" in a single glance.

**But** — and this is the key distinction — the Dashboard should surface recent activity as **lightweight summary cards that link elsewhere**, not as a full interactive review interface. What the Dashboard currently does is render the full question stem, difficulty badge, correct/incorrect status, and clickable links for every attempt. That's not a summary — that's a review page wearing a dashboard costume.

### The right mental model

| Page | Intent | Metaphor |
|------|--------|----------|
| **Dashboard** | "At a glance" | Analytics + lightweight pointers to recent work |
| **Practice** | "Do the work" | Configure and start sessions, handle in-progress sessions |
| **History** (formerly Review) | "Reflect on the work" | All past sessions, question breakdowns, reattempts, performance by topic |

This is not opinion. This is the pattern that UWorld and Amboss have converged on independently.

---

## 3. What Best-in-Class Question Bank Apps Do

### UWorld

UWorld's sidebar navigation has clearly separated concerns:

- **"Create Test"** = pure session configuration page — mode selection, subject filters, question count
- **"Previous Tests"** = dedicated review hub — list of all completed tests with expandable breakdowns, correct/incorrect per question, ability to review or retake
- **"Performance"** = analytics dashboard — overall accuracy by subject, comparison to peers, score trends over time

UWorld does **not** put session history on the Create Test page, and does **not** put question-level breakdowns on the Performance page. Each page has one job.

### Amboss

Amboss organizes under a "Learning" parent menu:

- **"Qbank > Create a Qbank Session"** = session setup
- **"Analysis > Session Analysis"** = post-session review hub

After completing a session, users are automatically redirected to Session Analysis. That page combines:
- Session summary (donut chart with % correct, time per question, total time)
- "Study Recommendations" linking to related articles
- "Performance Analytics" showing per-question breakdown with status, difficulty, time, and peer statistics

Creating a session and analyzing a session are **never on the same page**.

### The shared pattern

Both UWorld and Amboss treat session creation and session review as fundamentally separate concerns with separate navigation destinations. Both have a dedicated analytics/performance view that shows aggregate data (not individual question results). Both auto-route users to the review/analysis page after completing a session, creating a natural flow:

```
Create → Do → Review
```

Where each step has its own page.

**Neither app puts session history on the session creation page. Neither puts question-level breakdowns on the analytics/dashboard page.**

---

## 4. Detailed Recommendation

### Navigation restructure

| Current | Proposed |
|---------|----------|
| Dashboard | Dashboard |
| Practice | Practice |
| Quick Practice | Quick Practice |
| **Review** | **History** |
| Bookmarks | Bookmarks |
| Billing | Billing |

**Why rename "Review" to "History":**

1. "Review" implies a specific pedagogical action (reviewing missed questions), which is only one subset of what this page should contain. "History" communicates "everything you've done" — sessions, questions, performance over time.
2. "Review" creates confusion with "Reattempt." Users may wonder if the Review page is where they go to redo questions or where they go to look at past performance. "History" is unambiguous.

Alternative: "Performance" (matching UWorld's terminology), though that leans more toward analytics. "History" better captures the combined session-list + question-breakdown + reattempt functionality.

---

### Page-by-page changes

#### Dashboard (`/app/dashboard`)

| Action | Content |
|--------|---------|
| **Keep** | Four stats cards (total answered, overall accuracy, 7-day answered, 7-day accuracy), streak card, "Ready to practice?" CTA |
| **Add** | Compact "Recent sessions" section: 3 most recent sessions as single-line summary cards (mode, score, date) with link to History page. Optionally: "Recent missed questions" showing 3 most recently missed with stem preview and link to History |
| **Remove** | Entire "Recent activity" timeline with mixed ad-hoc/session question entries. All direct links to individual question pages. Dashboard should never render full question stems or act as a clickable question list |

**Dashboard's job:** "Here are your numbers. Here's your streak. Here are pointers to your most recent sessions and missed questions. Click through to History for details."

#### Practice (`/app/practice`)

| Action | Content |
|--------|---------|
| **Keep** | Session configuration (mode selector, question count, difficulty filters, tag/topic filters, Start session button). Incomplete session card (resume or abandon) |
| **Remove** | Entire "Recent sessions" section with expandable breakdowns — all of this moves to History |
| **Add** | Nothing. Clean, single-purpose session launcher |

**Post-session redirect:** After completing a session, redirect to `/app/history/{session-id}` (matching Amboss pattern).

**Practice's job:** "Configure your next study session. Resume an incomplete one."

#### Quick Practice (`/app/practice/quick`)

**No changes needed.** This page is clean and focused — single question, answer, feedback, next. It already follows single responsibility perfectly.

#### History (`/app/history`) — formerly Review

This becomes the **single source of truth** for all past activity. Two tabs or views:

**Sessions tab (default):**
- Chronological list of all completed sessions
- Each card: mode (Tutor/Exam), score, question count, duration, date
- Click to expand/navigate to session detail view:
  - Every question with stem preview, difficulty, correct/incorrect/unanswered status, time spent
  - "Review" link per question to open full question with explanation
  - "Reattempt" button for incorrect questions
- This is exactly what currently lives on the Practice page under "Recent sessions," elevated to its own space

**Missed Questions tab:**
- Current Review page content — filterable list of all incorrectly answered questions
- Difficulty and tag filters, full stem text, date missed, session origin, Reattempt buttons
- Already well-built; just needs to live as a tab within History rather than standalone

**Optional — Question Log tab:**
- Every individual question attempt (including ad-hoc Quick Practice) in flat chronological list
- Replaces current Dashboard timeline for users wanting a complete audit trail

**History's job:** "See everything you've done. Drill into any session. Find your weak spots. Reattempt what you missed."

#### Bookmarks (`/app/bookmarks`)

**No changes needed.** Bookmarks is a deliberate, user-curated list. Correctly separate from algorithmically determined "missed questions."

---

### Post-session redirect flow

Currently, after completing a session, the user must manually navigate to Practice or Dashboard to see results. The app should redirect to `/app/history/{session-id}` immediately after session completion, showing the session summary and question breakdown.

This creates a natural **Create → Do → Review** flow and eliminates the "where do I go to see my results?" confusion entirely.

---

### Wire-level description: History page

**Header:** "History" with subtitle "Your sessions, performance, and missed questions."

**Tab bar:** "Sessions" (active by default) | "Missed Questions"

**Sessions tab:**
- Sessions listed as cards in reverse chronological order
- Each card: single horizontal row with mode pill (Tutor/Exam), score (e.g., "14/20 correct — 70%"), duration, date
- "View details" affordance (chevron or expand button) reveals question breakdown
- Expanded view: table or card list — question number, stem preview (truncated), difficulty badge, status (Correct in green / Incorrect in red / Unanswered in gray), time spent
- Incorrect questions get "Reattempt" button
- All questions get "Review" link to see full question, explanation, and correct answer

**Missed Questions tab:**
- Difficulty and tag filter dropdowns at top
- Paginated list of incorrectly answered questions
- Each card: full stem text, difficulty, date missed, session origin label, Reattempt button

---

## 5. Challenging Assumptions

### The Dashboard should NOT be analytics-only

A pure stats dashboard with no recency signal or action-oriented content is a dead page in a learning app. The research on learning app engagement consistently shows that "continue where you left off" and "here's what you did recently" are critical dashboard elements. Duolingo's home screen isn't just stats — it shows your current lesson and streak. Khan Academy surfaces recent activity and recommended next steps.

**The fix isn't removing recent activity — it's changing its depth and interaction model.** The Dashboard should show 2-3 recent session summary cards (not individual questions) with clear "View details" links that point to the History page. This gives users the recency signal and wayfinding they need without turning the Dashboard into a shadow review page.

### "Single primary intent per page" not strict single responsibility

The Dashboard's primary intent is "understand my progress at a glance." Showing compact recent session cards supports that intent. What **violates** it is rendering full question stems with correct/incorrect badges and clickable links to individual questions — that's the History page's intent bleeding through.

### Do not add more nav items

With this restructure, nav stays at 6 items but each has a clearer mandate. The temptation might be to add a separate "Analytics" or "Performance" page for deeper aggregate data (accuracy by topic, difficulty breakdown, progress over time). **Resist that until you have the data to justify it** — for an early-stage board prep app with a relatively small question bank, the four stats cards on the Dashboard plus the session-level detail in History should be sufficient. An Analytics sub-section within History can be promoted later.

---

## Implementation Phases (Suggested)

### Phase 1: Consolidate History page
- Rename Review → History in nav and routing
- Add Sessions tab with session list (move from Practice page)
- Keep Missed Questions as second tab (existing Review content)
- Update all internal links

### Phase 2: Clean up Practice page
- Remove "Recent sessions" section
- Add post-session redirect to History
- Practice page becomes pure session launcher

### Phase 3: Slim down Dashboard
- Replace "Recent activity" timeline with compact session summary cards (3 max)
- Add "View all in History" link
- Remove direct question-level clickable links

### Phase 4 (Optional): Question Log tab
- Add third tab to History for flat chronological question audit trail
- Replaces Dashboard timeline for power users

---

## Open Questions

1. Should "History" be the final name, or is "Performance" or "Results" better?
2. Should the Sessions tab default-expand the most recent session?
3. Should Quick Practice attempts appear in the Sessions tab (they're session-less) or only in Question Log?
4. How aggressive should the Dashboard slim-down be — keep 3 recent sessions, or just 1 "last session" card?
