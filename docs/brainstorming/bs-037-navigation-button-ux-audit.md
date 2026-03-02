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

### Tracer 1: Quick Practice

1. Entry point: `app/(app)/app/practice/quick/quick-practice-client.tsx:73-77`
2. Header back link injected as `← Back to Practice` (`.../quick-practice-client.tsx:76`)
3. Shared action bar from `app/(app)/app/practice/components/practice-view.tsx`
4. Next button label is `Next →` (`.../practice-view.tsx:297-309`)

### Tracer 2: Tutor/Exam Session (In-Session)

1. Entry point: `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:184-240`
2. Passes `hasPreviousQuestion` and `hasNextQuestion` into `PracticeView`
3. `PracticeView` always renders Previous when `onPreviousQuestion` exists, but disables when `!hasPreviousQuestion` (`.../practice-view.tsx:270-283`)
4. `PracticeView` always renders Next, but disables when `hasNextQuestion === false` (`.../practice-view.tsx:297-309`)

### Tracer 3: Session Review

1. Entry point: `app/(app)/app/questions/[slug]/question-page-client.tsx`
2. Computes `navPrev`/`navNext` from `sessionNavigation` (`.../question-page-client.tsx:175-188`)
3. Renders `← Previous` link when `navPrev` exists, disabled button when null (`.../question-page-client.tsx:347-368`)
4. Renders `Next →` link when `navNext` exists, disabled button when null (`.../question-page-client.tsx:399-420`)
5. Back-link labels are already plain text via `getOriginUi` (`.../question-page-client.tsx:97-131`)

---

## Horizontal Tracer Bullets

| Surface | Prev/Next Labels | Boundary Behavior | Back Label Arrow |
|---|---|---|---|
| In-session Practice (`PracticeView`) | `← Previous`, `Next →` | Disabled | Quick uses arrow (`← Back to Practice`); default fallback has arrow (`← Back to Dashboard`) |
| Session Review (`QuestionView`) | `← Previous`, `Next →` | Disabled | No arrow (already plain text) |
| History pagination (Sessions/Questions tabs) | `Previous`, `Next` | Hidden (with spacer for Previous) | N/A |
| Error pages (`practice/quick`, `practice/[sessionId]`) | N/A | N/A | `Back to Practice` (plain text) |

Consistency gap: practice/review action bars use arrows + disabled boundaries, while history pagination already uses plain labels + hide-at-boundary behavior.

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

1. Should hidden boundary buttons reserve layout space (`<span />`) or allow compaction?
2. Should `Go to Practice →` be folded into BS-037 scope for full arrow consistency?
3. For mobile, do we want icons via SVG (e.g., `ChevronLeft`) instead of text arrows if direction affordance is still desired later?

---

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-01 | Created BS-037 | Visual audit captured navigation-label and boundary-control concerns |
| 2026-03-02 | Applied code-truth correction pass | Fixed inaccurate assumptions (session-review back labels already arrow-free), added full vertical/horizontal traces, and expanded test-impact coverage |
