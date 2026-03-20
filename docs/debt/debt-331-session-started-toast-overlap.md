# DEBT-331: "Session Started" Toast Overlaps Navigation Bar

**Priority:** P3
**Created:** 2026-03-20
**Source:** Manual UI review during DEBT-326 investigation
**Related:** [NotificationProvider](../../components/ui/notification-provider.tsx), [PracticeSessionToast](../../app/(app)/app/practice/[sessionId]/practice-session-toast.tsx)

---

## The Problem

When an exam or practice session starts, a green "Session started." toast appears at the top of the viewport. This toast renders directly on top of the app's navigation bar (Practice, History, Bookmarks, Billing tabs), making both the toast text and the nav text unreadable — they overlap and garble each other.

The toast container is positioned at `components/ui/notification-provider.tsx:128-149`:

```tsx
<div
  className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
  aria-live="polite"
>
```

The `fixed top-4` positioning places the toast 1rem from the top of the viewport. The app's navigation bar sits at approximately the same vertical position within the app shell, so the toast overlaps the nav tabs.

The toast is triggered from `app/(app)/app/practice/[sessionId]/practice-session-toast.tsx:46-56`:

```tsx
{ message: 'Session started.', tone: 'success' as const }
```

## Why This Is A Problem

- **Readability**: The toast text ("Session started") and the nav tab text ("History", "Bookmarks", etc.) overlap, making both illegible
- **Ephemeral overlap**: The toast auto-dismisses after a few seconds, but during that window the nav is unusable/unreadable
- **The toast provides low-value information**: The user just clicked "Start session" — they already know the session started. The toast confirms the obvious while blocking more useful UI

## Proposed Fix

Options (not mutually exclusive):

1. **Move toast below the nav bar** — Change `top-4` to a value that clears the app shell header + nav bar. This could be a fixed value or a CSS custom property tied to the header height. The app layout in `app/(app)/app/layout.tsx` renders `<AppSidebar>` + `<SidebarInset>` with a header; the toast should clear that header.

2. **Move toast to bottom** — Use `bottom-4` instead of `top-4`. Bottom toasts avoid header/nav conflicts entirely and are a common mobile pattern (Material Design uses bottom snackbars). This would be a global change to all toasts.

3. **Remove the "Session started" toast entirely** — It confirms an action the user just took. The page navigation itself is sufficient feedback (the user lands on the first question). Only keep the toast for the genuinely useful case: when fewer questions matched than requested (`"Only {actual} of {requested} questions matched your filters..."`).

4. **Offset for the app shell** — Keep `top-4` but only within the content area, not the viewport. Change `fixed` to `absolute` relative to the content container, or use a top offset that accounts for the header height.

## Scope

- **Toast positioning:** `components/ui/notification-provider.tsx:128-149` — affects all toasts app-wide
- **Toast trigger:** `app/(app)/app/practice/[sessionId]/practice-session-toast.tsx` — session-specific toast logic
- **Layout context:** `app/(app)/app/layout.tsx` — app shell header height determines the required offset

## Acceptance Criteria

- [ ] "Session started" toast does not overlap the navigation bar
- [ ] Toast text is fully readable when displayed
- [ ] Navigation bar remains usable/readable while toast is visible
- [ ] The informational toast ("Only X of Y questions matched...") still displays correctly
- [ ] Toast positioning works on both mobile and desktop viewports
