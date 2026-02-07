# DEBT-151: No Toast/Notification System

**Status:** Resolved
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

1. Implemented a shared notification system with `NotificationProvider` and `useNotification`:
   - `components/ui/notification-provider.tsx`
2. Wired the provider through app-wide `Providers` so every route can emit transient notifications:
   - `components/providers.tsx`
3. Migrated bookmark transient feedback from inline ad-hoc markup to shared toast notifications:
   - `app/(app)/app/practice/components/practice-view.tsx`
4. Preserved `ErrorCard` and inline loading regions for persistent errors/loading states (toasts only for transient action feedback).
5. Added regression coverage:
   - `components/ui/notification-provider.test.tsx`
   - `app/(app)/app/practice/[sessionId]/page.test.tsx`
   - `app/(app)/app/practice/components/practice-view.browser.spec.tsx`

## Verification

- [x] Toast component added and rendered in app layout
- [x] Bookmark toggle feedback uses toast instead of inline span
- [x] Toast has proper accessibility (`role="status"` or `aria-live`)
- [x] Toast auto-dismisses after configurable timeout
- [x] No regressions in existing error/loading state patterns

## Related

- DEBT-147 (archived): Error state UI duplicated — resolved with `ErrorCard`; toast is the transient counterpart
- DEBT-148: ARIA accessibility — toast must maintain accessibility standards
- SPEC-020 Phase 2+: Session navigation and summary will generate more transient feedback events
