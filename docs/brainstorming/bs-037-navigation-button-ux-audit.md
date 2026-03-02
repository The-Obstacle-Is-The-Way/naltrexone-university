# BS-037: Navigation Button UX Audit — Arrows, Visibility, and Contextual Hiding

**Date:** 2026-03-01
**Code-truth validation:** 2026-03-02
**Triggered by:** Visual review of Quick Practice and Tutor Session screens
**Scope:** Arrow symbols on navigation controls, boundary-state navigation buttons, and Quick Practice back-link copy
**Related:** BS-018, BS-019, SPEC-030, SPEC-032

---

## Verification Outcome

This audit is now validated against production source and targeted tests.

- Confirmed: `← Previous` / `Next →` are still rendered in both in-session practice and session-review action bars.
- Confirmed: first/last question boundaries currently render disabled nav buttons (not hidden).
- Confirmed: Quick Practice header uses `← Back to Practice`.
- Correction to prior draft: session-review back labels (`Back to Session`, `Back to History`, `Back to Bookmarks`, `Back to Practice`) are already arrow-free.
- Additional arrow-bearing string discovered outside the original scope: `Go to Practice →` in History Questions empty state (`app/(app)/app/history/components/history-questions-tab.tsx:388`).

---

## Vertical Tracer Bullets

### Tracer 1: Quick Practice (In-Session)

1. Entry point: `app/(app)/app/practice/quick/quick-practice-client.tsx:73-77`
2. Header back link injected as `← Back to Practice` (`.../quick-practice-client.tsx:76`) — **has arrow**
3. Shared action bar from `app/(app)/app/practice/components/practice-view.tsx`
4. **No Previous button** — `onPreviousQuestion` is not passed, so the conditional at `.../practice-view.tsx:270` is falsy
5. Next button always renders as `Next →` (`.../practice-view.tsx:297-309`) — **has arrow**
6. `hasNextQuestion` is not passed (`undefined`), so disabled check `hasNextQuestion === false` never triggers — Next always enabled
7. No question navigator grid — Quick Practice pulls from random pool, not a fixed sequence

### Tracer 2: Tutor Session (In-Session)

1. Entry point: `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:184-240`
2. Header shows `End session` button (`.../practice-view.tsx:145-152`)
3. Computes `previousQuestionId`/`nextQuestionId` from `navigator.rows` (`.../practice-session-page-view.tsx:67-99`)
4. Passes `onPreviousQuestion`, `hasPreviousQuestion`, `hasNextQuestion` into `PracticeView`
5. Previous renders as `← Previous`, disabled when `!hasPreviousQuestion` (`.../practice-view.tsx:270-283`) — **has arrow, disabled-at-boundary**
6. Next renders as `Next →`, disabled when `hasNextQuestion === false` (`.../practice-view.tsx:297-309`) — **has arrow, disabled-at-boundary**
7. Question navigator grid rendered above question area (`.../practice-session-page-view.tsx:189-195`)
8. Default back link fallback `← Back to Dashboard` (`.../practice-view.tsx:92`) is not rendered when `onEndSession` exists

### Tracer 3: Exam Session (In-Session)

1. Same `PracticeView` component as Tutor — identical Previous/Next arrow + disabled-at-boundary behavior
2. Header shows `Review answers` instead of `End session` (`.../practice-session-page-view.tsx:226`)
3. Additional `Mark for review` / `Unmark review` toggle button (`.../practice-view.tsx:322-332`) — no arrows
4. Explanation feedback hidden during exam (shown only after submission) via `isExamMode` guard (`.../practice-view.tsx:253`)

### Tracer 4: Exam Pre-Submit Review Stage

1. Entry point: `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:93-241`
2. Shows question grid with answered/unanswered/marked stats and per-question cards
3. Navigation is via `Open question` buttons (`.../exam-review-view.tsx:180`) — no arrows
4. Action buttons: `Submit exam` (`.../exam-review-view.tsx:192-193`), `Keep reviewing` (`:211-212`), `Confirm submit` (`:232-233`) — **all arrow-free**
5. **No Previous/Next navigation** — this stage uses random-access via "Open question" only

### Tracer 5: Session Summary (Post-Session)

1. Entry point: `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:13-109`
2. Displayed after both Tutor and Exam sessions end
3. Action buttons: `Back to Dashboard` (`:98`), `View in History` (`:101`), `Start another session` (`:104`) — **all arrow-free**
4. **No Previous/Next navigation** — this is a results page, not a question view

### Tracer 6: Session Review (Tutor Review / Exam Review)

1. Entry point: `app/(app)/app/questions/[slug]/question-page-client.tsx`
2. Reached via: session summary breakdown → question link, or history sessions tab → review
3. `sessionNavigation` is populated from session question sequence
4. Computes `navPrev`/`navNext` from `sessionNavigation` (`.../question-page-client.tsx:175-188`)
5. Renders `← Previous` link when `navPrev` exists, disabled button when null (`.../question-page-client.tsx:347-368`) — **has arrow, disabled-at-boundary**
6. Renders `Next →` link when `navNext` exists, disabled button when null (`.../question-page-client.tsx:399-420`) — **has arrow, disabled-at-boundary**
7. Back-link labels are already plain text via `getOriginUi` (`.../question-page-client.tsx:85-131`):
   - `from=practice` + `sessionId` → `Back to Session`
   - `from=practice` (no session) → `Back to Practice`
8. Review question navigator grid rendered when `sessionNavigation` exists (`.../question-page-client.tsx:213-224`)

### Tracer 7: Standalone Bookmark Review

1. Entry: Bookmarks page → "Review" button → `/questions/[slug]?from=bookmarks&mode=review`
2. Uses `QuestionView` but with **no `sessionNavigation`** — no session context
3. **No Previous/Next buttons rendered** — the `props.sessionNavigation` conditional at `.../question-page-client.tsx:346` and `:398` is falsy
4. Back-link: `Back to Bookmarks` (`.../question-page-client.tsx:112`) — **arrow-free**
5. Top back link shown (`.../question-page-client.tsx:203-210`) — arrow-free
6. Bottom back link shown when `submitResult` exists (`.../question-page-client.tsx:423-429`) — arrow-free
7. **No question navigator grid** — standalone question, not a sequence

### Tracer 8: History-Sequence Review

1. Entry: History questions tab → question link with `historySeq` parameter
2. Uses `QuestionView` with `sessionNavigation` built from history sequence slugs
3. Same `← Previous` / `Next →` arrows and disabled-at-boundary behavior as Tracer 6
4. Back-link: `Back to History` (`.../question-page-client.tsx:104`) — **arrow-free**
5. Top back link hidden for `origin === 'history'` (`.../question-page-client.tsx:173`)

### Tracer 9: Individual Question Review (Dashboard / Direct Link)

1. Entry: Dashboard recent activity → question link → `/questions/[slug]?from=dashboard`
2. Uses `QuestionView` with **no `sessionNavigation`** — standalone question
3. **No Previous/Next buttons** — same as Tracer 7 (standalone context)
4. Back-link: `Back to Dashboard` (`.../question-page-client.tsx:129`) — **arrow-free**
5. Top back link shown — arrow-free

### Tracer 10: Bookmarks Page (List View)

1. Entry point: `app/(app)/app/bookmarks/page.tsx`
2. Header link: `Go to Practice` (`:55`) — **arrow-free**
3. Empty state: `Start practicing` button (`:67`) — **arrow-free**
4. Per-card actions: `Review` (`:144`), `Remove` (`:164`) — **arrow-free**
5. **No Previous/Next pagination** — all bookmarks displayed in a flat list

### Tracer 11: History Pagination (Sessions & Questions Tabs)

1. Sessions tab: `Previous` / `Next` (`.../history-sessions-tab.tsx:285,301`) — **arrow-free**
2. Questions tab: `Previous` / `Next` (`.../history-questions-tab.tsx:509,529`) — **arrow-free**
3. Boundary: **hidden-at-boundary** — Previous uses `<span />` spacer when `offset === 0`, Next fully removed when no next page
4. One outlier: `Go to Practice →` in Questions tab empty state (`.../history-questions-tab.tsx:388`) — **has arrow**

---

## Horizontal Tracer Bullets

| Surface | Prev/Next Labels | Boundary Behavior | Back/Action Labels | Arrow Status |
|---|---|---|---|---|
| Quick Practice (in-session) | `Next →` only (no Previous) | N/A (Next always enabled) | `← Back to Practice` | **2 arrows** |
| Tutor Session (in-session) | `← Previous`, `Next →` | Disabled | `← Back to Dashboard` (fallback, not rendered when End session shows) | **2 arrows** (+ fallback) |
| Exam Session (in-session) | `← Previous`, `Next →` | Disabled | Same fallback as Tutor | **2 arrows** (+ fallback) |
| Exam Pre-Submit Review | None | N/A | `Open question`, `Submit exam`, `Keep reviewing` | **Clean** |
| Session Summary (post-session) | None | N/A | `Back to Dashboard`, `View in History`, `Start another session` | **Clean** |
| Session Review — from practice (`QuestionView`) | `← Previous`, `Next →` | Disabled | `Back to Session` / `Back to Practice` | **2 arrows** |
| Session Review — from history (`QuestionView`) | `← Previous`, `Next →` | Disabled | `Back to History` | **2 arrows** |
| Standalone Bookmark Review (`QuestionView`) | None | N/A | `Back to Bookmarks` | **Clean** |
| Individual Question Review (`QuestionView`) | None | N/A | `Back to Dashboard` | **Clean** |
| History pagination (Sessions/Questions tabs) | `Previous`, `Next` | Hidden (spacer for Previous) | N/A | **Clean** (except `Go to Practice →` empty state) |
| Bookmarks page (list view) | None | N/A | `Go to Practice`, `Start practicing`, `Review`, `Remove` | **Clean** |
| Dashboard | None | N/A | `Go to Practice`, `View all` | **Clean** |
| Pricing page | None | N/A | `Back to Home`, `Manage Billing`, `Go to Dashboard` | **Clean** |
| Error pages (`practice/quick`, `practice/[sessionId]`) | None | N/A | `Back to Practice` | **Clean** |

**Consistency gap:** In-session practice and session-review action bars use arrows + disabled-at-boundary. History pagination already uses plain labels + hide-at-boundary. All other surfaces (bookmarks, dashboard, pricing, summaries, exam review, standalone question review) are already arrow-free and don't use disabled-at-boundary.

**Arrow concentration:** All 7 arrow-bearing labels are confined to 3 files: `practice-view.tsx` (3), `question-page-client.tsx` (4), `quick-practice-client.tsx` (1). The `Go to Practice →` in `history-questions-tab.tsx` is the sole outlier outside these files.

---

## Problems

### Problem 1: Arrow symbols add noise and create cross-surface inconsistency

**Confirmed arrow-bearing navigation copy in production code:**

| Location | Text | File |
|---|---|---|
| In-session action bar | `← Previous` | `app/(app)/app/practice/components/practice-view.tsx:282` |
| In-session action bar | `Next →` | `app/(app)/app/practice/components/practice-view.tsx:308` |
| Session-review action bar | `← Previous` | `app/(app)/app/questions/[slug]/question-page-client.tsx:361,366` |
| Session-review action bar | `Next →` | `app/(app)/app/questions/[slug]/question-page-client.tsx:413,418` |
| Quick Practice top-right | `← Back to Practice` | `app/(app)/app/practice/quick/quick-practice-client.tsx:76` |
| PracticeView fallback header link | `← Back to Dashboard` | `app/(app)/app/practice/components/practice-view.tsx:92` |

**Already arrow-free references:**
- History pagination: `Previous` / `Next`
  - `app/(app)/app/history/components/history-sessions-tab.tsx:285,301`
  - `app/(app)/app/history/components/history-questions-tab.tsx:509,529`
- Practice error pages: `Back to Practice`
  - `app/(app)/app/practice/quick/error.tsx:19`
  - `app/(app)/app/practice/[sessionId]/error.tsx:19`
- Review origin back labels (`Back to Session` / `Back to History` / `Back to Bookmarks` / `Back to Practice`) are already arrow-free at source:
  - `app/(app)/app/questions/[slug]/question-page-client.tsx:104,112,122,129`

### Problem 2: First/last question nav shows disabled controls instead of hiding

| Context | First Question | Last Question |
|---|---|---|
| In-session (Tutor/Exam) | Previous rendered disabled | Next rendered disabled |
| Session review | Previous rendered disabled `<button>` | Next rendered disabled `<button>` |
| History pagination baseline | Previous hidden when `offset === 0` (spacer) | Next hidden when no next page |

### Problem 3: Quick Practice back-link arrow is unnecessary

Quick Practice header currently sets `← Back to Practice` directly in its composition layer (`quick-practice-client.tsx:76`). The directional semantics are already in the word "Back".

---

## Severity Assessment

- Arrow-copy inconsistency: Low (polish)
- Disabled boundary buttons: Low-Medium (interaction cleanliness)
- Quick Practice back-link arrow: Low (polish)

Classification: UX polish, not functional correctness defects.

---

## Proposed Fix (Implementation Contract)

### Fix 1: Remove arrows from in-scope navigation copy

| Before | After |
|---|---|
| `← Previous` | `Previous` |
| `Next →` | `Next` |
| `← Back to Practice` | `Back to Practice` |
| `← Back to Dashboard` | `Back to Dashboard` |

Note: Do not include `Back to Session` / `Back to History` / `Back to Bookmarks` in this rename set; they are already arrow-free.

### Fix 2: Hide boundary nav controls instead of rendering disabled

- In `PracticeView`:
  - Hide Previous when `!hasPreviousQuestion`
  - Hide Next when `hasNextQuestion === false`
- In `QuestionView`:
  - Keep current `navPrev`/`navNext` branching, but remove disabled-button fallback branches

### Fix 3: Keep layout stability explicit

If button disappearance causes undesirable shift, use a spacer strategy consistent with history pagination (`<span />` placeholder) or apply min-width constraints on the action bar.

### Optional Scope Decision

Decide whether `Go to Practice →` (`history-questions-tab.tsx:388`) is included in this bug's "remove arrows everywhere" interpretation. Current BS-037 scope does not require it, but this is the only remaining runtime right-arrow navigation copy after Fix 1.

---

## Test Impact (Confirmed)

| Test File | Expected Update |
|---|---|
| `app/(app)/app/practice/components/practice-view.test.tsx` | Arrow label assertions; disabled-vs-hidden boundary assertions |
| `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | Role queries for `Next →` / `← Previous` |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx` | Role queries and boundary disabled assertions |
| `app/(app)/app/practice/quick/quick-practice-client.test.tsx` | Back-link text assertion |
| `app/(app)/app/practice/quick/page.test.tsx` | Back-link text assertion |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Arrow text assertions and disabled boundary expectations |
| `tests/e2e/helpers/bookmark.ts` | `Next →` button-name selectors |
| `tests/e2e/session-review-navigation.spec.ts` | `Next →`/`← Previous` text and "disabled on last question" expectations |

---

## Validation Evidence

Validated on 2026-03-02 using focused suites:

```bash
pnpm test --run 'app/(app)/app/practice/components/practice-view.test.tsx' \
  'app/(app)/app/practice/quick/quick-practice-client.test.tsx' \
  'app/(app)/app/practice/quick/page.test.tsx' \
  'app/(app)/app/questions/[slug]/question-page-client.test.tsx'
```

Result: 4 files passed, 69 tests passed.

```bash
pnpm test:browser 'app/(app)/app/practice/components/practice-view.browser.spec.tsx' \
  'app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx'
```

Result: 2 files passed, 21 tests passed.

---

## Open Questions

1. ~~Should hidden boundary buttons reserve layout space (`<span />`) or allow compaction?~~ **Decided:** Use `<span />` spacer (see Decision Log 2026-03-02).
2. ~~Should `Go to Practice →` be folded into BS-037 scope for full arrow consistency?~~ **Decided:** Yes, included (see Decision Log 2026-03-02).
3. For mobile, do we want icons via SVG (e.g., `ChevronLeft`) instead of text arrows if direction affordance is still desired later? — **Deferred.** Out of scope for BS-037 implementation.

---

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-01 | Created BS-037 | Visual audit captured navigation-label and boundary-control concerns |
| 2026-03-02 | Applied code-truth correction pass | Fixed inaccurate assumptions (session-review back labels already arrow-free), added full vertical/horizontal traces, and expanded test-impact coverage |
| 2026-03-02 | Deep tracer expansion — all modes | Expanded from 3 vertical tracers to 11, covering every user-facing mode: Quick Practice, Tutor in-session, Exam in-session, Exam pre-submit review, Session summary, Session review (practice + history origins), Standalone bookmark review, History-sequence review, Individual question review, Bookmarks list, History pagination. Horizontal table expanded from 4 rows to 15. Confirmed arrow concentration in 3 files + 1 outlier. |
| 2026-03-02 | Use `<span />` spacer for hidden boundary buttons | Matches history pagination precedent (`history-sessions-tab.tsx:285`). Prevents layout shift when Previous/Next disappear at boundaries. |
| 2026-03-02 | Include `Go to Practice →` in scope | One extra string change in `history-questions-tab.tsx:388`. Eliminates the last arrow in the entire app for full consistency. |
| 2026-03-02 | Defer SVG icon question | Out of scope for BS-037. Can revisit if direction affordance is desired on mobile in a future pass. |
