# DEBT-151: No Toast/Notification System

**Status:** Open
**Priority:** P3
**Date:** 2026-02-07

---

## Description

The app has no centralized toast or notification component. Transient feedback (success messages, loading indicators, error alerts) is implemented ad-hoc using inline `<output>`, `<span aria-live="polite">`, and `<div role="alert">` elements scattered across pages. Each page reinvents the pattern.

## Current Feedback Patterns

| Pattern | Example Location | Usage |
|---------|-----------------|-------|
| `<output aria-live="polite">` | `practice-session-history-panel.tsx:51-52` | Loading states |
| `<span aria-live="polite">` | `practice-view.tsx:140` | Bookmark toggle feedback ("Bookmarked!" / "Removed") |
| `<div role="alert">` | `practice-session-starter.tsx:191` | Session start error |
| `ErrorCard` component | `bookmarks/page.tsx`, `billing/page.tsx` | Persistent error states |
| Inline text with timeout | `practice-view.tsx:140` | Auto-dismissing success message |

### What works well

- `ErrorCard` is now a shared component (DEBT-147, resolved) — persistent errors are consistent
- `<output aria-live="polite">` and `role="alert"` provide correct accessibility semantics
- Loading and error states are handled on every page

### What's missing

- No shared component for **transient** success/info feedback (the "Bookmarked!" pattern)
- No stacking/queuing behavior for multiple notifications
- No consistent positioning (some feedback is inline, some at section level)
- New pages must copy-paste the feedback pattern from existing pages

## Impact

- Low impact today — the app has few transient success messages
- Impact grows as features are added (SPEC-020 Phases 2-4 will add more user actions that need feedback)
- Each new transient message requires manual `aria-live` wiring, timeout management, and cleanup-on-unmount logic
- Not blocking anything currently

## Resolution

1. Add a toast component — shadcn/ui provides `sonner` integration (`npx shadcn@latest add sonner`)
2. Wire `<Toaster />` into the app layout
3. Replace ad-hoc transient messages with `toast()` calls
4. Keep `ErrorCard` for persistent error states (toasts are for transient feedback only)
5. Keep `<output aria-live="polite">` for inline loading indicators (toasts are for action results)

### Decision needed

Choose between:
- **shadcn/sonner** (recommended) — already in the shadcn ecosystem, minimal config
- **react-hot-toast** — lighter weight but outside the shadcn ecosystem
- **Custom** — full control but more work

## Verification

- [ ] Toast component added and rendered in app layout
- [ ] Bookmark toggle feedback uses toast instead of inline span
- [ ] Toast has proper accessibility (`role="status"` or `aria-live`)
- [ ] Toast auto-dismisses after configurable timeout
- [ ] No regressions in existing error/loading state patterns

## Related

- DEBT-147 (archived): Error state UI duplicated — resolved with `ErrorCard`; toast is the transient counterpart
- DEBT-148: ARIA accessibility — toast must maintain accessibility standards
- SPEC-020 Phase 2+: Session navigation and summary will generate more transient feedback events
