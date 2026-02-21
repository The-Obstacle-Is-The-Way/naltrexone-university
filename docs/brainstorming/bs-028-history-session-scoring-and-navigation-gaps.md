# BS-028: History Page UX Audit — Scoring, Navigation, and Interaction Gaps

**Date:** 2026-02-21
**Triggered by:** Dogfooding + comprehensive browser agent audit of the History page (both Sessions and Questions tabs)
**Scope:** Tutor mode score misleads users; absurd session durations; session card not clickable; Sessions vs Questions review experience parity gap; missing hover states, filters, pagination counts; Questions tab minor issues
**Related:** [BS-022](../_archive/brainstorming/bs-022-unanswered-question-review-handling.md) (Unanswered Question Review Handling — archived), [SPEC-034](../specs/spec-034-unanswered-question-review-handling.md), [BS-027](./bs-027-history-tab-bar-visual-inconsistency.md) (Tab bar visual drift)

---

## The Problems

### P0 — Critical

#### Problem 1: Tutor Mode Score Hides Unanswered Questions

**Observed:** A Tutor session with 5 questions where only 1 was answered (correctly) and 4 were left unanswered displays:

```
Tutor • 1/1 correct (100%) • 42s • Feb 20, 2026
```

**Expected:** The display should reflect that 4 questions were not answered. Something like:

```
Tutor • 1/5 correct (20%) • 42s • Feb 20, 2026
```

The current logic is **intentionally designed** this way — Tutor mode uses `answered` as the denominator while Exam mode uses `questionCount`. But from a user's perspective, seeing "100%" when you only answered 1 out of 5 questions is misleading. It gives a false sense of mastery.

**Browser audit confirmed:** Expanding the breakdown reveals 5 questions (1 Correct, 4 Unanswered) while the header proclaims 100%. The visual contradiction is immediate and jarring.

**Edge case — "0/0 correct (—)":** Multiple sessions display `Tutor • 0/0 correct (—)` when all questions were unanswered. The `(—)` dash is a division-by-zero fallback that's cryptic to users. No explanation of what it means. These should be flagged as "Abandoned" or show `0/N correct (0%)`.

#### Problem 2: Absurd Session Durations

**Observed by browser audit — new finding:**

Multiple sessions show wildly wrong durations:
- `Tutor • 0/4 correct (0%) • 1403m 51s` (23 hours 23 minutes)
- `Tutor • 0/0 correct (—) • 918m 4s` (15 hours 18 minutes)
- `Tutor • 0/0 correct (—) • 1274m 30s` (21 hours 14 minutes)

These are clearly timer bugs — the session timer never stopped when the user left the tab open or backgrounded the app. There is zero validation or capping on the duration value.

**Root cause:** `computeSessionDurationSeconds()` in `src/domain/services/session-stats.ts` simply subtracts `startedAt` from `endedAt` with no upper bound:

```typescript
return Math.max(0, Math.floor((endedAtMs - startedAtMs) / MS_PER_SECOND));
```

If a session is started, the user backgrounds the tab for 23 hours, then ends it — the full wall-clock time is recorded as "study duration."

**Recommendation:** Either cap display at a reasonable maximum (e.g., show `> 1h` with a warning indicator) or detect outliers server-side. A 23-hour "study session" is nonsensical and undermines trust.

### P1 — Significant

#### Problem 3: Sessions vs Questions Tab Review Experience Parity Gap

**Observed by browser audit — new finding:**

When you click a question from the **Sessions tab**, you get a rich review page:
- Question navigator with numbered color-coded bubbles (green=correct, red=incorrect, dark=unanswered)
- "Question X of Y" counter
- "Previous" and "Next" navigation buttons
- Session-scoped context

When you click a question from the **Questions tab**, you get a stripped-down page:
- **No** question navigator
- **No** "Question X of Y" counter
- **No** Previous/Next navigation
- Just "Try Again" + "Back to History"

This is a major inconsistency. A user reviewing from the Questions tab is completely isolated — they can only look at one question, then go back, scroll to find the next one, click it, repeat. There is no continuity of review.

**Root cause:** The Questions tab links pass `from: 'history'` but no `sessionId`, so the question review page has no session context to build a navigator from. The question is displayed standalone.

**Recommendation:** The Questions tab review should pass an ordered list context (or at minimum the current filter result set) so users get Previous/Next navigation through their filtered question list.

#### Problem 4: Session Card Not Clickable → Review Mode

**Observed:** To get from the History sessions list to the session review navigator, the user must:

1. Click "View breakdown" button on the session card
2. Wait for breakdown to load
3. Click an individual question link in the breakdown list

**Expected:** Clicking the session card header ("Tutor • 1/1 correct • 42s") or some prominent element should navigate directly to the session review navigator (starting at question 1).

**Browser audit confirmed:** The `<li>` elements have `role=null`, `tabindex=null`, `onclick=null`, and `cursor: auto`. Only the button inside is interactive. Clicking on "Tutor", "1/1 correct (100%)", "42s", or "Feb 20, 2026" does nothing. This violates the standard pattern where the whole row is the tap target — the card text spans 70%+ of the row with no affordance.

#### Problem 5: No "Go to Session Review" Action in Breakdown

**Observed:** Once the breakdown is expanded, the only navigation options are individual question links. There is no button or link to enter the full session review mode (question navigator starting at question 1).

**Expected:** The breakdown panel should have a prominent "Review session" action in addition to the per-question links.

#### Problem 6: Hover States Invisible in Dark Mode

**Observed by browser audit — new finding:**

| Element | Has Visible Hover? |
|---------|-------------------|
| Session card row | No visual change, no cursor change |
| "View breakdown" button | `hover:bg-accent` exists but accent color (`--accent: 0 0% 11%`) against the similarly dark background produces near-zero contrast delta |
| Question links (in breakdown) | Underlines on hover (good) |
| "Previous"/"Next" pagination | No visible hover state |
| Tab buttons (Sessions/Questions) | Barely perceptible |

The "View breakdown" button has Tailwind hover utilities (`hover:bg-accent`, `hover:text-accent-foreground`, `dark:hover:bg-input/50`) but the theme values in dark mode produce virtually zero visible contrast change. Users hovering the button see nothing happen, making it feel unresponsive.

**Recommendation:** Minimum 15% luminance difference on hover. Either increase the accent lightness delta or add a border/outline change on hover.

**Cross-reference:** Related to BS-027's dark mode token contrast findings — the same dark-on-dark issue affects both the tab bar active state and the session card interactive elements.

### P2 — Moderate

#### Problem 7: Question Navigator Scrolled Off-Screen on Load

**Observed by browser audit — new finding:**

When landing on the question review page from the Sessions tab, the page loads with the navigator scrolled out of view. The user lands mid-page at the question text. The navigator — the primary orientation tool — requires scrolling up to find.

**Recommendation:** Either auto-scroll to top on question load, make the navigator sticky, or relocate it below the question content.

#### Problem 8: Sessions Tab Missing Filters and Pagination Counts

**Observed by browser audit — new finding:**

The **Questions tab** has rich filtering (Result, Source, Difficulty, Tag) and shows "Showing 1–20 of 48." The **Sessions tab** has zero filters and no result count or page indicator. Users can't filter by session type (Tutor/Exam), date, or performance. The bare "Previous"/"Next" text links give no page position context.

**Recommendation:** Add at minimum a Type filter (Tutor/Exam) and "Showing X–Y of Z sessions" count to the Sessions tab to match the Questions tab's UX quality.

#### Problem 9: Dual "Back to History" Links on Review Page

**Observed by browser audit — new finding:**

The question review page has "Back to History" at both the **top right** and the **bottom left**, with different visual styling. One is a plain text link, the other more prominent.

**Recommendation:** One "Back to History" is enough. Keep it in the bottom action area alongside Previous/Next.

### P3 — Minor

#### Problem 10: Duplicate "Other" Tag in Questions Tab Filter

**Observed by browser audit — new finding:**

The Tag dropdown contains two entries labeled "Other" — one with value `other` and one with `other-treatment`. Users see two identical "Other" items with no way to distinguish them.

**Root cause:** The canonical taxonomy defines `other` (Substance kind, display name "Other") and `other-treatment` (Treatment kind, display name "Other") as separate tags. The **Practice page** avoids this collision by rendering three **separate** filter sections — Topic, Substance, Treatment — so each "Other" lives in its own labeled group and is unambiguous. But the **History Questions tab** flattens all three tag kinds into a single `<select>` dropdown sorted by `name`, losing the kind context entirely.

**Code trace:**
- Taxonomy: `lib/content/draftTaxonomy.ts` — `CANONICAL_SUBSTANCE_SLUGS` has `'other'`, `CANONICAL_TREATMENT_SLUGS` has `'other-treatment'`
- DB: Both rows have `name: 'Other'` in the `tags` table
- History page: `app/(app)/app/history/page.tsx:86-94` — filters to topic/substance/treatment kinds, maps to `{ slug, name }`, sorts by name — no kind qualifier
- Dropdown: `app/(app)/app/history/components/history-questions-tab.tsx:182-196` — renders `tag.name` as option label

**Recommendation — two approaches:**

**Option A (Recommended): Group by kind using `<optgroup>`.**
- Render the tag dropdown with `<optgroup label="Topic">`, `<optgroup label="Substance">`, `<optgroup label="Treatment">` groups
- Mirrors the Practice page's three-section layout in dropdown form
- Each "Other" lives under its own group heading — unambiguous
- Requires passing `tag.kind` through to the component (currently only `slug` and `name` are passed)

**Option B: Qualify duplicate names with kind suffix.**
- Only when a collision exists, append the kind: "Other (Substance)" vs "Other (Treatment)"
- Simpler but less structural — doesn't help if future tags create new collisions

#### Problem 11: "Try Again" Label on Correct Questions

**Observed by browser audit — new finding:**

The Questions tab review page shows "Try Again" even for questions the user already answered correctly. "Try Again" semantically implies retrying a failure. For correct answers, "Practice Again" would be more appropriate.

#### Problem 12: No Sort Control on Questions Tab

**Observed by browser audit — new finding:**

The Questions tab shows 48 questions with filters but no sort controls. Users can't sort by difficulty, result (incorrect first), or recency. Sorting by "Incorrect first" would be the most educationally useful default.

#### Problem 13: Question Text Truncates Mid-Sentence

**Observed by browser audit — new finding:**

Question cards truncate at ~120 characters, often mid-sentence or mid-drug name. Either show the full first sentence (to a natural period) or just the first line — mid-sentence truncation signals "there's more" without giving enough context to be useful.

#### Problem 14: Filter Dropdowns Use Native `<select>` — Visually Divergent from Design System

**Observed by dogfooding — new finding:**

The History Questions tab filter bar uses four raw HTML `<select>` elements for Result, Source, Difficulty, and Tag. The project does **not** have a `components/ui/select.tsx` — the shadcn/ui Select component has never been installed. The trigger state is hand-styled with Tailwind (`history-questions-tab.tsx:28-29`):

```typescript
const selectClassName =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]';
```

This makes the closed/trigger look passable, but when the dropdown opens, the **option list is rendered by the OS/browser**, not by the design system:
- Dropdown panel background, text color, and hover highlight are OS-controlled
- Individual `<option>` elements cannot be styled with CSS
- The dropdown arrow/chevron is the browser default
- No animations, transitions, or theme-aware hover states
- On macOS dark mode: semi-dark picker. On Windows: potentially bright white. Inconsistent.

**Why it feels "janky":** The subtle border spacing, the mismatched arrow glyph, the font rendering inside options, and the overall lack of cohesion with the rest of the dark-theme UI. Every other interactive element on the page (buttons, links, chips, cards) follows the design system — these four dropdowns don't.

**Contrast with Practice page:** The Practice session starter uses `FilterChip` components for tag selection — fully styled, theme-aware pill buttons with `bg-primary text-primary-foreground` active states. No native form controls. The History Questions tab is the only place in the app using native `<select>` for user-facing filtering.

**Root cause:** The shadcn/ui `Select` component (based on Radix UI `@radix-ui/react-select`) was never added to the project. The filter bar was likely built quickly using native HTML form elements to get the feature working, and the visual polish step was never taken.

**Recommended fix — three options:**

**Option A (Recommended): Install shadcn/ui Select and refactor all 4 dropdowns.**
- `npx shadcn@latest add select`
- Refactor `<select>` → `<Select>` / `<SelectTrigger>` / `<SelectContent>` / `<SelectItem>`
- For the Tag filter specifically: use `<SelectGroup>` + `<SelectLabel>` to group by kind (Topic/Substance/Treatment), which also solves the duplicate "Other" problem (Problem 10)
- Radix Select supports `name` prop for native form data, so the existing `method="get"` form submission should still work
- Full dark mode theme integration, animated open/close, keyboard navigation with typeahead
- Trade-off: ~8-12 KB bundle addition; minor Radix accessibility gaps (missing `aria-activedescendant` — [Radix issue #3636](https://github.com/radix-ui/primitives/issues/3636)) that are non-blocking for filter controls

**Option B (Future — not ready yet): CSS `appearance: base-select`.**
- A new CSS-only opt-in that makes native `<select>` fully stylable (dropdown panel, options, arrow, animations)
- Supported in Chrome 135+, Edge 135+ (~69% global coverage as of Feb 2026)
- **Not supported in Firefox or Safari** — roughly 1 in 3 users would still see the janky native dropdown
- Revisit when Firefox ships support (estimated late 2026 or 2027)

**Option C (Minimal): Keep native `<select>` but add `appearance: none` + custom SVG arrow.**
- Improves the trigger state only — dropdown panel remains OS-controlled
- Doesn't solve the core problem but reduces the "mismatched arrow" jank
- Not recommended: half-measure that still leaves the dropdown unstyled

**Recommendation:** Option A now, with Option B as a simplification path when browser support matures. This also naturally solves Problem 10 (duplicate "Other") via `<SelectGroup>` grouping by tag kind.

---

## Root Cause Analysis

### Problem 1: Score Denominator Logic

**File:** `src/application/use-cases/get-session-history.ts:57-58`

```typescript
const accuracyDenominator =
  session.mode === 'exam' ? questionCount : answered;
```

**File:** `app/(app)/app/history/components/history-sessions-tab.tsx:64-65`

```typescript
const fractionDenominator =
  row.mode === 'exam' ? row.questionCount : row.answered;
```

Both the use case and the display component use `answered` (not `questionCount`) as the denominator for Tutor mode. This was a deliberate design decision — Tutor mode is "learn as you go," so the thinking was only answered questions should count.

**But the UX consequence is bad:** A user who quits a Tutor session after answering 1 of 5 questions sees "100%" — which is technically "100% of what you answered" but reads as "you aced this session."

**Existing test confirms this is intentional** (`get-session-history.test.ts:85-138`): The test explicitly asserts Tutor mode with 1 answered + 1 unanswered yields `accuracy: 1` (100%).

### Problem 2: Duration Has No Upper Bound

**File:** `src/domain/services/session-stats.ts:30-38`

```typescript
export function computeSessionDurationSeconds(
  startedAt: Date,
  endedAt: Date,
): number {
  const startedAtMs = startedAt.getTime();
  const endedAtMs = endedAt.getTime();
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) return 0;
  return Math.max(0, Math.floor((endedAtMs - startedAtMs) / MS_PER_SECOND));
}
```

Pure wall-clock subtraction. No cap, no outlier detection. If the browser tab stays open for 23 hours between `startedAt` and `endedAt`, that's what gets recorded.

### Problem 3: Questions Tab Has No Session Context

The Questions tab links to question review via `toQuestionRoute(slug, { from: 'history', mode: 'review' })` but passes **no `sessionId`**. Without a session ID, the question review page cannot build a navigator or Previous/Next links. The question renders in standalone mode.

### Problem 4: Session Card Has No Click Handler

**File:** `app/(app)/app/history/components/history-sessions-tab.tsx:78-81`

```typescript
<li
  key={row.sessionId}
  className="rounded-xl border border-border/60 bg-muted/20 p-3"
>
```

The `<li>` is a plain container with no `onClick`, no `role="button"`, no `tabIndex`, and no `cursor: pointer`. The session summary text (lines 83-94) is a `<div>` with `<span>` children — none are links or buttons.

### Problem 5: Breakdown Only Has Per-Question Links

**File:** `app/(app)/app/shared/components/session-breakdown-list.tsx:26-38`

Each question row is a `<Link>` to `toQuestionRoute(slug, { from, mode: 'review', sessionId, historyHref })`. There is no session-level "Review all" link or button in the breakdown panel.

---

## Severity Assessment

| # | Problem | Priority | Frequency | Impact |
|---|---------|----------|-----------|--------|
| 1 | Misleading Tutor score (1/1 vs 1/5) | **P0** | Every early-quit Tutor session | False confidence; undermines scoring trust |
| 2 | Absurd session durations (1403m) | **P0** | Multiple existing sessions | Nonsensical data; undermines trust |
| 3 | Sessions vs Questions review parity | **P1** | Every Questions tab review | No navigator, no Previous/Next from Questions |
| 4 | Session card not clickable | **P1** | Every session interaction | Violates tap-target convention |
| 5 | No "Review session" in breakdown | **P1** | Every breakdown expansion | Must click individual question to enter review |
| 6 | Hover states invisible in dark mode | **P1** | Every interaction | Buttons feel unresponsive |
| 7 | Navigator off-screen on load | **P2** | Every question review entry | Orientation tool hidden |
| 8 | Sessions tab missing filters/counts | **P2** | Growing with session count | Unusable at scale |
| 9 | Dual "Back to History" links | **P2** | Every question review page | Redundant, inconsistent styling |
| 10 | Duplicate "Other" tag | **P3** | Questions tab filter use | Confusing but minor |
| 11 | "Try Again" on correct questions | **P3** | Correct question review | Semantic mismatch |
| 12 | No sort on Questions tab | **P3** | Questions tab use | Missing educational feature |
| 13 | Mid-sentence truncation | **P3** | All question cards | Low utility preview text |
| 14 | Native `<select>` dropdowns diverge from design system | **P2** | Every Questions tab filter use | Only native form controls in the app; visually incoherent with dark theme |

---

## Proposed Fix (Sketch)

### Fix 1: Unify Score Denominator (P0)

**Option A (Recommended): Always use `questionCount` as denominator for both modes.**

- Tutor and Exam both show `correct/questionCount` → e.g., "1/5 correct (20%)"
- Simple, honest, consistent
- Requires updating: `get-session-history.ts`, `history-sessions-tab.tsx`, and their tests
- The "0/0 correct (—)" edge case becomes "0/N correct (0%)" — clear and honest

**Option B: Show dual info for Tutor.**

- Display: "1/1 answered correct • 4 unanswered • 5 total"
- More informative but more complex UI

**Option C: Keep Tutor denominator as `answered` but add an "unanswered" indicator.**

- Display: "1/1 correct (100%) • 4 unanswered"
- Preserves current logic but makes the incompleteness visible

### Fix 2: Cap or Flag Absurd Durations (P0)

**Option A (Recommended): Display cap with warning.**

- Cap duration display at a reasonable threshold (e.g., 60 minutes)
- Sessions exceeding the cap show `> 1h` or the actual time with a visual indicator
- Pure display-layer fix — no data modification

**Option B: Detect outliers server-side.**

- Flag sessions where duration exceeds N standard deviations from median
- Requires statistical analysis at query time

### Fix 3: Questions Tab Review Parity (P1)

- The Questions tab should pass an ordered list context (filtered question IDs/slugs) so the review page can build a navigator
- May require a new route parameter pattern or a lightweight "ad-hoc list" concept
- At minimum: Previous/Next navigation through the current filter result set

### Fix 4: Make Session Card Navigable (P1)

**Option A (Recommended): Make the session summary text a link.**

- Wrap "Tutor • 1/5 correct (20%) • 42s • Feb 20, 2026" in a `<Link>` that navigates to the first question of the session in review mode
- Keep "View breakdown" button for the expanded detail view
- Requires: knowing the first question's slug (may need to fetch or include in the session history row)

**Option B: Make the entire card clickable (expand/collapse).**

- The `<li>` becomes a clickable card that toggles the breakdown
- Add `cursor: pointer` and hover state to the card
- "View breakdown" button label stays for accessibility but whole card is the target

### Fix 5: Add "Review Session" Button to Breakdown (P1)

- Add a "Review session" button/link at the top of the breakdown panel
- Links to the first question of the session in review mode
- Straightforward addition to `SessionBreakdownList` or the breakdown container in `history-sessions-tab.tsx`

### Fix 6: Dark Mode Hover States (P1)

- Increase accent color lightness delta for hover states (minimum 15% luminance difference)
- Or add border/outline change on hover for the "View breakdown" button and session card
- Cross-reference with BS-027 / SPEC-037 dark mode token work

### Fix 7–9: Moderate Polish (P2)

- **Navigator scroll:** Auto-scroll to top on question load, or make navigator sticky
- **Sessions filters/counts:** Add Type filter (Tutor/Exam) and "Showing X–Y of Z" count
- **Dual "Back to History":** Remove top-right duplicate, keep bottom action area only

### Fix 10–13: Minor Polish (P3)

- Rename duplicate "Other" tag to "Other Treatments" in UI
- Change "Try Again" to "Practice Again" for correct questions
- Add "Sort by" dropdown to Questions tab
- Truncate question previews at sentence boundary instead of character count

---

## What Works Well (Browser Audit Confirmed)

These should be preserved in any refactor:

- **Keyboard navigation:** Tab order follows logical flow, focus rings visible
- **"Back to History" preserves page context:** Return URL correctly encodes pagination offset
- **Question navigator colors semantically correct:** Green=correct, red=incorrect, dark-outlined=unanswered
- **"Hide breakdown" / "View breakdown" toggle:** Label changes correctly on expand/collapse
- **"Clear filters" conditional display:** Only appears when filters are active in Questions tab
- **Filter count updates:** "Showing 1–20 of 23" updates correctly after applying filters
- **Question source labels:** "Exam session", "Tutor session", "Ad-hoc practice" give useful provenance
- **"You did not answer this question" banner:** Correctly shown for unanswered questions in session review

---

## Open Questions

1. **Should Tutor and Exam scoring be fully unified?** Or is there a valid reason to keep Tutor denominator as `answered`? (User feedback strongly suggests unification.)

2. **What slug do we use for the session-level link?** The session history rows don't currently include question slugs. Options:
   - Fetch the first question slug on the server when building the history page
   - Add `firstQuestionSlug` to the `SessionHistoryRow` type
   - Use the session review endpoint to get the first question, then redirect

3. **Should the session card navigate to review mode, or to the breakdown?** The user's instinct is that clicking the card should go to the review navigator (Question 1 of N with Previous/Next). The breakdown could remain an inline expand action via the button.

4. **How should the Questions tab pass list context to the review page?** Options:
   - URL parameter with encoded question slug list (could get long)
   - Store filtered result in session storage
   - New API endpoint that returns a review-context for a list of question IDs

5. **What's the right duration cap?** 60 minutes? 120 minutes? Should it be configurable or a hard ceiling?

6. **Does the "Back to History" link from the review page need updating?** Currently it uses `historyHref` to preserve pagination state. This should continue working regardless of how we enter review mode.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-21 | Created brainstorming doc (3 problems) | Dogfooding revealed misleading Tutor score and navigation friction |
| 2026-02-21 | Expanded to 13 problems after browser audit | Chrome agent audit found 8 additional issues across both tabs: duration bug, review parity gap, hover states, pagination, filters, Questions tab minor issues |
