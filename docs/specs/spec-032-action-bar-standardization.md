# SPEC-032: Action Bar Standardization

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Feature
**Date:** 2026-02-17
**Resolves:** [BS-019](../brainstorming/bs-019-action-bar-label-and-ordering-consistency.md)

---

## Overview

The bottom action bars across Practice, Quick Practice, Exam, and History Review have 9 documented inconsistencies in label style, button ordering, boundary behavior, and navigation patterns. These are not bugs — everything works — but they undermine muscle memory for users who practice and then review the same questions in different contexts.

This spec standardizes the action bar to follow **Option A** (BS-019): preserve the Practice/Quick Practice mental model (`Submit` then `Next`), standardize `Next →` arrow labels, and align History to match.

See [BS-019](../brainstorming/bs-019-action-bar-label-and-ordering-consistency.md) for the full 38-state audit matrix, root cause analysis, and severity assessment. This spec defines the target state and exact changes.

---

## Test Harness Requirements (Mandatory)

All test work in this spec must follow repo-wide React 19 + Vitest rules:

1. Every `*.test.tsx` file must start with `// @vitest-environment jsdom` on line 1
2. Render-output tests must use `renderToStaticMarkup` (not `@testing-library/react`)
3. Interactive/async checks belong in `*.browser.spec.tsx` or Playwright E2E
4. Update existing test files/helpers first; avoid duplicate test files for the same behavior

---

## Requirements

### Functional

1. **Label standardization:** All contexts use `Next →` (arrow suffix), never `Next Question`
2. **Ordering standardization:** All contexts follow `← Previous · primary action · Next → · secondary actions · back link`
3. **Boundary standardization:** First-question Previous and last-question Next are **disabled-but-visible** (not hidden) in session-based contexts when session navigation metadata exists
4. **Back navigation placement policy:** Keep current pattern — header-only in Practice/Quick Practice; in review contexts, header is always present and bottom back appears when `sessionNavigation` or `submitResult` is present
5. **Quick Practice:** No Previous (intentional — no session context), follows same label and ordering otherwise
6. **Bookmark in History Review:** Deferred (separate feature addition, not a consistency fix)

### Non-Functional

1. No shared action bar component — keep inline rendering per context (per design-principles §4)
2. No changes to Exam Review Stage or Session Summary action bars (specialized, not part of this standardization)
3. No mobile layout model changes (wrap vs stack) — defer to separate concern
4. `<a>` vs `<button>` semantics preserved per context: enabled History nav remains links; disabled boundary states render native disabled buttons (no disabled `<a>`)

---

## Target Action Bar States

### Standard Ordering (All Contexts)

```
[← Previous] [Submit / Try Again] [Next →] [Bookmark] [Mark for review] [Back to ...]
 sequential    primary action       sequential  secondary    secondary       navigation
```

### By Context (Target State)

| Context | Bottom Action Bar |
|---------|-------------------|
| Practice — before submit | `← Previous` · `Submit` · `Next →` · `Bookmark` |
| Practice — after submit (Tutor) | `← Previous` · `Submit` (disabled) · `Next →` · `Bookmark` |
| Practice — after submit (Exam) | `← Previous` · `Submit` (disabled) · `Next →` · `Bookmark` · `Mark for review` |
| Quick Practice — before submit | `Submit` · `Next →` · `Bookmark` |
| Quick Practice — after submit | `Submit` (disabled) · `Next →` · `Bookmark` |
| History Session Review (answered) | `← Previous` · `Try Again` · `Next →` · `Back to ...` |
| History Session Review (unanswered) | `← Previous` · `Submit` · `Next →` · `Back to ...` |
| History Individual Review (answered) | `Try Again` · `Back to ...` |
| History Individual Review (unanswered) | `Submit` |
| History Individual Review (post-submit) | `Try Again` · `Back to ...` |

### Boundary Behavior (Target State)

| Boundary | Current (Mixed) | Target |
|----------|----------------|--------|
| Practice Q1 — Previous | Disabled (visible) | **Disabled (visible)** — no change |
| History Q1 — Previous | Hidden | **Disabled (visible)** — matches Practice |
| Practice last Q — Next | Enabled (handler manages edge) | **Disabled (visible)** — consistent boundary signal |
| History last Q — Next | Hidden | **Disabled (visible)** — matches Practice |
| Quick Practice — Previous | Absent | **Absent** — no change (no session context) |

---

## Exact Changes

### File 1: `app/(app)/app/practice/components/practice-view.tsx`

**Change A — Label:** Rename "Next Question" to "Next →"

```diff
// practice-view.tsx — Next button label (approx line 274-282)
- Next Question
+ Next →
```

**Change B — Boundary:** Disable Next on last question instead of leaving it always enabled.

- Add optional `hasNextQuestion?: boolean` to `PracticeViewProps`
- For session-based views, pass explicit value from session navigator wiring
- For non-session contexts (Quick Practice), default to enabled (`hasNextQuestion !== false`)

### File 2: `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`

**Change C — Last-Q wiring:** Compute and pass `hasNextQuestion` to `PracticeView`, mirroring the existing `previousQuestionId` wiring.

- Compute `nextQuestionId` from `navigator.rows` + `currentQuestionId` (skip unavailable rows, same guard style as previous lookup)
- Pass `hasNextQuestion={nextQuestionId !== null}` into `PracticeView`

### File 3: `app/(app)/app/questions/[slug]/question-page-client.tsx`

**Change D — Ordering:** Move `Next →` link to AFTER the primary action (Submit/Try Again), before the back link.

Current order (History Session Review):
```
← Previous | Next → | Try Again | Back to ...
```

Target order:
```
← Previous | Try Again | Next → | Back to ...
```

**Change E — Boundary:** Show disabled Previous on Q1 and disabled Next on last Q, instead of hiding them.

Use this required rendering pattern in `QuestionView`:

- **Enabled state:** `<Button asChild><Link ...>...</Link></Button>`
- **Disabled state:** `<Button disabled>...</Button>` (no `Link`)

This keeps enabled route-navigation semantics as links while using valid disabled behavior at boundaries.

### File 4: `docs/frontend/design-principles.md`

**Change F — Update action bar composition table** to reflect the new standardized ordering and labels.

```diff
// design-principles.md — §2 Action Bar Composition
- [← Previous] [Submit / Next →] [Bookmark / Mark for review] [Back link]
-  sequential    primary action    secondary actions              navigation
+ [← Previous] [Submit / Try Again] [Next →] [Bookmark / Mark for review] [Back link]
+  sequential    primary action      sequential  secondary actions           navigation
```

Update the "By Context" table to match the Target State table above.

Remove the "Known inconsistency" callouts (lines 74 and 130) since BS-019 will be resolved.

---

## Resolved Decisions

| BS-019 Open Question | Resolution | Rationale |
|---------------------|------------|-----------|
| Q1: Which option? | **Option A** | Lowest disruption, preserves Practice muscle memory |
| Q2: "Try Again" label? | **Keep.** Different contexts justify different labels. History = re-attempting a past answer. Practice = submitting live. | Context-appropriate |
| Q3: "Next Question" verbose? | **No.** Use `Next →` everywhere. Compact, symmetric with `← Previous`. | Visual consistency |
| Q4: Spec or quick fix? | **Spec** (this document). | Scope includes boundary behavior, ordering, and design-principles update |
| Q5: Quick Practice post-submit? | **Answered.** Submit disabled, no swap. Same as Tutor. | Confirmed by Playwright |
| Q6: Bookmark in History Review? | **Defer.** Feature addition, not a consistency fix. Track separately. | Scope control |
| Q7: Boundary — hide or disable? | **Disabled-but-visible.** Signals "this exists, you're at the edge." | Consistent boundary model |
| Q8: Duplicate back nav in History? | **Keep both.** Header back is always present for escape. Bottom back appears alongside sequential nav in review contexts. This is an established History UX pattern. | Preserve existing UX |
| Q9: `<a>` vs `<button>`? | **Keep both.** History uses `<a>` (route navigation). Practice uses `<button>` (state callbacks). Both are semantically correct. | Correct HTML semantics |
| Q10: Mobile wrap vs stack? | **Defer.** Layout model standardization is a separate concern. | Scope control |

---

## Tests First

### Unit Tests

```typescript
// app/(app)/app/practice/components/practice-view.test.tsx — update/add
it('renders "Next →" label (not "Next Question")', () => {
  // Assert button text is "Next →"
});

it('disables Next button on last question', () => {
  // Render with hasNextQuestion=false, assert disabled
});

it('disables Previous button on first question', () => {
  // Already tested — verify still passes
});

it('orders buttons as: Previous, Submit, Next, Bookmark', () => {
  // Assert DOM order matches spec
});
```

```typescript
// app/(app)/app/practice/components/practice-view.browser.spec.tsx — update existing checks
it('uses "Next →" in interactive practice flow', async () => {
  // Replace role/name lookups that currently target "Next Question"
});
```

```typescript
// app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx — add
it('passes hasNextQuestion=false when current question is last available', async () => {
  // Assert PracticeView receives Next disabled at session boundary
});
```

```typescript
// app/(app)/app/questions/[slug]/question-page-client.test.tsx — update/add
it('orders History Review buttons as: Previous, Try Again, Next, Back', () => {
  // Assert DOM order: ← Previous, Try Again, Next →, Back to History
});

it('shows disabled Previous on first question of session review', () => {
  // Render sessionNavigation with currentIndex=0
  // Assert Previous button exists AND is disabled
});

it('shows disabled Next on last question of session review', () => {
  // Render sessionNavigation with currentIndex=questions.length-1
  // Assert Next button exists AND is disabled
});
```

### E2E Tests

`tests/e2e/bs-019-action-bar-audit.spec.ts` already tests the current (inconsistent) state. After implementation, update assertions:
- Practice: `Next →` label (not `Next Question`)
- History: ordering matches `← Previous · Try Again · Next → · Back to ...`
- Boundary: disabled Previous/Next visible at edges (not hidden)

Also update shared helpers/assertions that currently hard-code `Next Question`, especially:
- `tests/e2e/helpers/bookmark.ts`
- `tests/e2e/bs-019-action-bar-audit.spec.ts`
- any E2E specs that assert hidden boundary links on session review first/last question

---

## Implementation Notes

### Disabled link pattern

History Review uses `<Button asChild><Link>` for enabled Previous/Next (renders as `<a>`). HTML `<a>` elements don't natively support `disabled`.

This spec requires one pattern:
- Render a `<Button>` (not `asChild`) when disabled
- Render `<Button asChild><Link>` when enabled

```tsx
{navPrev ? (
  <Button variant="outline" size="sm" asChild>
    <Link
      href={toQuestionRoute(navPrev.slug, {
        from: props.sessionNavigation.from,
        mode: 'review',
        sessionId: props.sessionNavigation.sessionId,
        historyHref: props.historyHref,
      })}
    >
      ← Previous
    </Link>
  </Button>
) : (
  <Button variant="outline" size="sm" disabled>← Previous</Button>
)}
```

### Ordering consistency verification

After implementation, the action bar DOM order for all contexts should match this pattern (absent elements are simply not rendered):

```
← Previous | primary action | Next → | secondary actions | Back to ...
```

This can be verified by reading `data-slot="button"` children left-to-right in the action bar container.

### Quick Practice — no structural changes

Quick Practice reuses `PracticeView` without passing `onPreviousQuestion`. The label change from "Next Question" to "Next →" is the only change needed — it inherits automatically via `PracticeView`.

### Exam mode — no ordering changes

Exam mode already uses the same `PracticeView` component as Tutor. The label change to "Next →" and boundary behavior apply automatically.

---

## Deferred Items (Not in Scope)

| Item | Why Deferred | Tracked In |
|------|-------------|------------|
| Add Bookmark to History Review | Feature addition, not consistency fix | BS-019 Q6 |
| Mobile layout model (wrap vs stack) | Separate layout concern | BS-019 Q10 |
| Converge Submit / Try Again labels | Context justifies different labels | BS-019 Q2 (resolved: keep both) |
| Exam Review Stage action bar | Specialized (Submit Exam), not part of question-level standardization | BS-019 scope boundary |
| Session Summary action bar | Specialized (Back to Dashboard, View in History, Start another), not question-level | BS-019 scope boundary |

---

## Success Criteria

1. All question-viewing contexts use `Next →` (never `Next Question`)
2. Button ordering follows `← Previous · primary action · Next → · secondary actions · back link` in all contexts
3. First-question Previous is disabled-but-visible (not hidden) in all session-based contexts
4. Last-question Next is disabled-but-visible (not hidden) in all session-based contexts
5. Quick Practice correctly omits Previous (no session) but uses `Next →` label
6. Design-principles §2 accurately reflects the implemented action bar composition
7. No "Known inconsistency" callouts remain in design-principles.md for action bar items
8. All existing E2E action bar tests pass with updated assertions

---

## Related

- [BS-019](../brainstorming/bs-019-action-bar-label-and-ordering-consistency.md) — Full 38-state audit matrix, 9 inconsistencies, root cause analysis
- [SPEC-030](../_archive/specs/spec-030-question-view-ux-unification.md) — Established navigation zone model (Phase 1 of action bar work)
- [Design Principles](../frontend/design-principles.md) — Action bar composition (§2), to be updated
- [E2E Tests](../../tests/e2e/bs-019-action-bar-audit.spec.ts) — Playwright audit covering all 4 contexts
