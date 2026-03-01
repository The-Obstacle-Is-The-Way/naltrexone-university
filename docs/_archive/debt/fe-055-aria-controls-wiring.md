# FE-055 Follow-up: QuestionNavigator `aria-controls` Wiring

**Priority:** P3
**Status:** Resolved
**Found:** 2026-02-16 (during FE-055 phase 1)
**Resolved:** 2026-03-01
**Component:** Frontend — Accessibility

---

## Summary

The `QuestionNavigator` component renders numbered buttons for jumping between questions during in-progress practice sessions (tutor/exam mode). Phase 1 ([FE-055 archived](./fe-055-exam-navigator-missing-nav-landmark.md)) added the `<nav>` landmark and `aria-current="step"`. This follow-up adds the missing `aria-controls` wiring so screen readers can announce the programmatic relationship between each navigator button and the question content panel it controls.

## Implemented Files

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-view.tsx` | Added `questionPanelId?: string` prop (line 40) and panel `id={props.questionPanelId}` on question container (line 169) |
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` | Added required `controlledPanelId: string` prop (line 32) and `aria-controls={controlledPanelId}` on each navigator button (line 75) |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` | Added `const questionPanelId = useId()` (line 64), passed to `PracticeView` (line 187) and `QuestionNavigator` (line 193) |
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.test.tsx` | Added regression assertion that every navigator button exposes `aria-controls="practice-question-panel"` |
| `app/(app)/app/practice/components/practice-view.test.tsx` | Added regression assertion that question panel renders matching `id` when `questionPanelId` is provided |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx` | Added end-to-end wiring assertion: navigator `aria-controls` value resolves to an existing element `id` |

## Reference Implementation

`components/mobile-nav.tsx` already implements this pattern correctly:

```tsx
const navId = useId();
// trigger button:
<button aria-controls={navId} aria-expanded={isOpen} ...>
// controlled panel:
<nav id={navId} ...>
```

## Before → After (Implemented)

### `practice-session-page-view.tsx`

```tsx
// Before: no ID coordination
<QuestionNavigator review={navigator} ... />
<PracticeView topContent={...} ... />

// After: generate ID and pass to both
const questionPanelId = useId();
<QuestionNavigator review={navigator} controlledPanelId={questionPanelId} ... />
<PracticeView questionPanelId={questionPanelId} topContent={...} ... />
```

### `exam-review-view.tsx` (QuestionNavigator)

```tsx
// Before:
<Button aria-label={...} aria-current={...}>

// After:
<Button aria-label={...} aria-current={...} aria-controls={controlledPanelId}>
```

### `practice-view.tsx`

```tsx
// Before:
<div ref={props.questionAreaRef} tabIndex={-1} className="outline-none">

// After:
<div id={props.questionPanelId} ref={props.questionAreaRef} tabIndex={-1} className="outline-none">
```

## TDD Approach

Completed via Red → Green in this order:

1. **Red:** Added failing assertions in `exam-review-view.test.tsx` and `practice-view.test.tsx`
2. **Red:** Added failing end-to-end assertion in `practice-session-page-view.browser.spec.tsx`
3. **Green:** Wired `questionPanelId`/`controlledPanelId` props through all three files
4. **Green:** Updated direct `QuestionNavigator` browser-spec call sites to satisfy new required prop contract
5. **Verify:** Landmark and `aria-current` coverage remained intact

## Verification

```bash
# Navigator buttons have aria-controls
pnpm test --run -- exam-review-view

# Content panel has matching id
pnpm test --run -- practice-view

# End-to-end wiring exists in rendered session page
pnpm test:browser

# Static wiring tokens present in source
rg -n 'controlledPanelId|aria-controls' 'app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx' 'app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx'
rg -n 'questionPanelId|id=\\{props.questionPanelId\\}' 'app/(app)/app/practice/components/practice-view.tsx'

# No regressions
pnpm typecheck && pnpm lint && pnpm test --run
```

## Acceptance Criteria

- [x] Each `QuestionNavigator` button has `aria-controls` pointing to the question content panel
- [x] The question content panel `<div>` has an `id` matching the same value used by navigator `aria-controls`
- [x] `useId()` generates the stable ID (React 18+ pattern, SSR-safe)
- [x] Regression tests pass (landmark, `aria-current`, existing behavior)

---

## Related

- [FE-055 Phase 1 (archived)](./fe-055-exam-navigator-missing-nav-landmark.md) — Added `<nav>` landmark + `aria-current="step"` (Resolved 2026-02-16)
- `components/mobile-nav.tsx` — Reference implementation of `aria-controls` pattern
- `docs/frontend/pattern-registry.md` Part 18.3 — Documents `aria-expanded` + `aria-controls` as standard pattern
