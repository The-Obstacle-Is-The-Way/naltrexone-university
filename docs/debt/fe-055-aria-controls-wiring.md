# FE-055 Follow-up: QuestionNavigator `aria-controls` Wiring

**Priority:** P3
**Status:** Active
**Found:** 2026-02-16 (during FE-055 phase 1)
**Component:** Frontend — Accessibility

---

## Summary

The `QuestionNavigator` component renders numbered buttons for jumping between questions during in-progress practice sessions (tutor/exam mode). Phase 1 ([FE-055 archived](../_archive/debt/fe-055-exam-navigator-missing-nav-landmark.md)) added the `<nav>` landmark and `aria-current="step"`. This follow-up adds the missing `aria-controls` wiring so screen readers can announce the programmatic relationship between each navigator button and the question content panel it controls.

## Affected Files

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-view.tsx` | Add stable `id` to question content `<div>` (line 167) |
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` | Accept `controlledPanelId` prop, add `aria-controls` to each `<Button>` |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` | Generate `useId()`, pass to both `QuestionNavigator` and `PracticeView` |

## Reference Implementation

`components/mobile-nav.tsx` already implements this pattern correctly:

```tsx
const navId = useId();
// trigger button:
<button aria-controls={navId} aria-expanded={isOpen} ...>
// controlled panel:
<nav id={navId} ...>
```

## Current → Target

### `practice-session-page-view.tsx`

```tsx
// Current: no ID coordination
<QuestionNavigator review={navigator} ... />
<PracticeView topContent={...} ... />

// Target: generate ID and pass to both
const questionPanelId = useId();
<QuestionNavigator review={navigator} controlledPanelId={questionPanelId} ... />
<PracticeView questionPanelId={questionPanelId} topContent={...} ... />
```

### `exam-review-view.tsx` (QuestionNavigator)

```tsx
// Current (line 64-72):
<Button aria-label={...} aria-current={...}>

// Target:
<Button aria-label={...} aria-current={...} aria-controls={controlledPanelId}>
```

### `practice-view.tsx`

```tsx
// Current (line 167):
<div ref={props.questionAreaRef} tabIndex={-1} className="outline-none">

// Target:
<div id={props.questionPanelId} ref={props.questionAreaRef} tabIndex={-1} className="outline-none">
```

## TDD Approach

1. **Red:** Add test in `exam-review-view.test.tsx` asserting each navigator button has `aria-controls` matching a non-empty string
2. **Red:** Add test in `practice-view.test.tsx` asserting the question content div has a matching `id` when `questionPanelId` is provided
3. **Green:** Wire the props through
4. **Verify:** Existing tests still pass (landmark + `aria-current` unchanged)

## Verification

```bash
# Navigator buttons have aria-controls
pnpm test --run -- exam-review-view

# Content panel has matching id
pnpm test --run -- practice-view

# No regressions
pnpm typecheck && pnpm lint && pnpm test --run
```

## Acceptance Criteria

- [ ] Each `QuestionNavigator` button has `aria-controls` pointing to the question content panel
- [ ] The question content panel `<div>` has a matching `id`
- [ ] `useId()` generates the stable ID (React 18+ pattern, SSR-safe)
- [ ] Regression tests pass (landmark, `aria-current`, existing behavior)

---

## Related

- [FE-055 Phase 1 (archived)](../_archive/debt/fe-055-exam-navigator-missing-nav-landmark.md) — Added `<nav>` landmark + `aria-current="step"` (Resolved 2026-02-16)
- `components/mobile-nav.tsx` — Reference implementation of `aria-controls` pattern
- `docs/frontend/pattern-registry.md` Part 18.3 — Documents `aria-expanded` + `aria-controls` as standard pattern
