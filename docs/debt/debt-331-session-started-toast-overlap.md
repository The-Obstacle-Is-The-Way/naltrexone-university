# DEBT-331: "Session Started" Toast Overlaps Navigation Bar

**Priority:** P3
**Created:** 2026-03-20
**Source:** Manual UI review during DEBT-326 investigation
**Related:** [NotificationProvider](../../components/ui/notification-provider.tsx), [PracticeSessionToast](../../app/(app)/app/practice/[sessionId]/practice-session-toast.tsx)

---

## The Problem

When an exam or practice session starts, a green "Session started." toast appears at the top of the viewport. This toast renders directly on top of the app's navigation bar (Practice, History, Bookmarks, Billing tabs), making both the toast text and the nav text unreadable — they overlap and garble each other.

The overlap is not speculative. The current toast region in `components/ui/notification-provider.tsx:128-149` is `fixed inset-x-0 top-4 z-50 flex justify-center px-4`, so every toast is pinned 1rem from the top of the viewport. The app shell header in `app/(app)/app/layout.tsx:75-92` occupies that same band.

## Why This Is A Problem

- **Readability**: The toast text ("Session started") and the nav tab text ("History", "Bookmarks", etc.) overlap, making both illegible
- **Ephemeral overlap**: The toast auto-dismisses after a few seconds, but during that window the nav is unusable/unreadable
- **The toast provides low-value information**: The user just clicked "Start session" — they already know the session started. The toast confirms the obvious while blocking more useful UI

## Verified Findings

### 1. Vertical positioning chain

- `components/providers.tsx:43-68` mounts `NotificationProvider` above the entire route tree, so the toast is viewport-fixed, not scoped to the app content area.
- `components/ui/notification-provider.tsx:128-149` positions every toast at `top-4` (16px from the viewport top).
- `app/(app)/app/layout.tsx:75-91` renders the app shell header. Its inner row is `py-4`, adding 32px vertical padding before child height is counted.
- The tallest regular header controls are 44px high:
  - `components/auth-nav.tsx:75-95` gives the Clerk trigger `min-h-[44px] min-w-[44px]`.
  - `components/mobile-nav.tsx:107-121` uses `p-2.5` around a `size-6` icon, which also resolves to 44px.
  - `components/theme-toggle.tsx:21-27` is `size-11` (44px) on mobile and `sm:size-9` (36px) on larger screens.
- Result: the base header content box is 44px + 32px padding = 76px (4.75rem), before the header border.
- A top-fixed toast that preserves the current 16px visual gap would therefore need to start at roughly 92-93px (5.75rem), which maps to `top-24` (96px), not `top-4`.
- `app/(app)/app/layout.tsx:115-128` can also prepend `PastDueBanner`, which is `py-3 text-sm` plus a border. That adds another ~45px. In the past-due state, the full banner+header stack is about 121-122px, so a toast preserving the same gap would need to start around 137-138px (8.5rem), which maps to `top-36` (144px).
- Conclusion: a global top offset is stateful and brittle. A single fixed `top-{N}` cannot correctly clear both the normal shell and the banner variant without leaving a large empty gap on the common path.

### 2. Horizontal positioning chain

- `components/ui/notification-provider.tsx:128-149` uses `fixed inset-x-0 ... flex justify-center px-4`, so the toast is centered in the viewport.
- The inner container is `w-full max-w-sm`, so the toast width is `min(viewport width - 32px, 24rem / 384px)`.
- There is no app sidebar in the current shell. The desktop conflict is with the centered horizontal nav cluster rendered by `components/app-desktop-nav.tsx:17-38` inside the same header row.
- On mobile, the toast expands to nearly full width and competes with the same header band that contains the brand, menu button, theme toggle, and auth control. `components/mobile-nav.tsx:26-30` also drops the mobile nav menu immediately below the header with `absolute ... top-full`, so a merely-offset top toast still has to dodge that disclosure surface.

### 3. All current toast consumers

`rg -n "notify\\(|useNotification\\(" app components src` shows only three production callers:

1. `app/(app)/app/practice/[sessionId]/practice-session-toast.tsx:35-67`
   - Emits either:
     - low-value success: `"Session started."`
     - valuable info: `"Only {actual} of {requested} questions matched your filters..."`
2. `app/(app)/app/bookmarks/bookmarks-toast.tsx:25-41`
   - Redirect-backed success toast: `"Bookmark removed."`
3. `app/(app)/app/practice/components/practice-view.tsx:289-306`
   - Bookmark success/error notifications during an active practice session

There are no other production `notify()` callers today.

### 4. Placement options, evaluated from the code

#### Option A: Remove the `"Session started."` toast entirely

- Pros:
  - Removes a low-value confirmation that duplicates the page transition.
  - Matches `docs/frontend/standards.md:491-499`, which already says session start feedback should be the navigation itself.
  - Small local blast radius in the session-start flow.
- Cons:
  - By itself, it does **not** fix placement for the remaining valuable shortfall toast or the bookmark toasts, because `NotificationProvider` would still be pinned at `top-4`.
- Verdict:
  - Correct as part of the fix, but insufficient as the only change.

#### Option B: Move the shared toast region to `bottom-4`

- Pros:
  - Clears the header, desktop nav, mobile header controls, and the optional past-due banner for every current toast consumer.
  - No app-shell sidebar or fixed bottom nav exists today, so there is no persistent viewport-fixed bottom UI to collide with.
  - Keeps the shared provider model intact for bookmarks and practice notifications.
- Cons:
  - Some pages have document-flow action rows near the bottom of content:
    - `app/(app)/app/practice/components/practice-view.tsx:453-491`
    - `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:143-185`
    - `app/(app)/app/questions/[slug]/question-page-client.tsx:371-470`
  - A bottom toast can visually overlap those rows if they are near the viewport edge.
- Why this is acceptable:
  - Those rows are not `fixed` or `sticky`; they scroll with content.
  - The toast region is already `pointer-events-none`, so this remains a visual-only overlap, not a click-blocking layer.
  - The current top placement causes guaranteed header overlap on route-entry toasts. The bottom placement trades that for a lower-frequency, non-blocking overlay over in-flow content.
- Verdict:
  - Best global placement option for the current codebase.

#### Option C: Keep top placement and offset it below the shell (`top-{N}`)

- Pros:
  - Minimal conceptual change to the provider.
- Cons:
  - Needs ~`top-24` in the normal shell and ~`top-36` when `PastDueBanner` is present.
  - `NotificationProvider` lives above the route tree (`components/providers.tsx:43-68`), so it does not naturally know which shell/banner state is active.
  - Still has to reason about the mobile menu disclosure at `components/mobile-nav.tsx:26-30`.
- Verdict:
  - Rejected. Too much global coupling for a fragile result.

#### Option D: Scope the toast inside the content area instead of the viewport

- Pros:
  - Would clear the header by construction.
- Cons:
  - Requires architectural reshaping of the shared provider or per-page replacement UIs.
  - Changes how bookmark toasts behave across multiple routes, not just session start.
  - Adds divergence between page-local feedback and shared app toasts without a strong need.
- Verdict:
  - Rejected for now. Higher blast radius than necessary.

### 5. Bottom-placement prior art audit

- I found no fixed bottom app shell surfaces, bottom nav bars, floating action buttons, or sticky footers in app routes.
- The reviewed "bottom action bars" are regular flow containers, not viewport-fixed:
  - `app/(app)/app/practice/components/practice-view.tsx:453-491`
  - `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:143-185`
  - `app/(app)/app/questions/[slug]/question-page-client.tsx:371-470`
- This means a bottom toast does not fight an existing persistent bottom overlay system.

## Verified Recommendation

Use a two-part fix:

1. **Reposition the shared toast region to the bottom of the viewport.**
   - Change `components/ui/notification-provider.tsx:130` from:
     - `pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4`
   - To:
     - `pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4`
   - No width or tone classes need to change. `max-w-sm` remains appropriate.

2. **Remove the redundant success toast from the session-start flow, but keep the shortfall warning toast.**
   - In `app/(app)/app/practice/practice-page-session-start.ts:114-119`, stop appending `toast=session_started` by default. Only append `toast=session_started&requestedCount=...&actualCount=...` when `actualCount < requestedCount`. Successful starts with no shortfall should navigate straight to `/app/practice/[sessionId]`.
   - In `app/(app)/app/practice/[sessionId]/practice-session-toast.tsx:46-56`, remove the `{ message: 'Session started.', tone: 'success' }` branch. The component should notify only when both counts parse and `actual < requested`; otherwise it should render nothing.

Why this is the cleanest verified fix:

- It eliminates the low-value toast that created the reported bug.
- It preserves the valuable shortfall warning and the bookmark toasts.
- It fixes placement once at the shared provider for all remaining toast consumers.
- It avoids the brittle top-offset math imposed by the app shell header and optional past-due banner.

## TDD: Tests To Write / Update Before Implementation

1. Update `app/(app)/app/practice/practice-page-logic.test.ts:1348-1375`.
   - The current success-path test expects `/app/practice/session-1?toast=session_started`.
   - Replace it with a failing expectation for `/app/practice/session-1` when `actualCount === requestedCount`.
   - Keep the shortfall case asserting `/app/practice/session-1?toast=session_started&requestedCount=50&actualCount=30`.

2. Update `app/(app)/app/practice/[sessionId]/practice-session-toast.browser.spec.tsx:6-80`.
   - Remove the tests that expect `"Session started."`.
   - Replace them with failing assertions that no toast renders for:
     - bare `code="session_started"`
     - `requestedCount === actualCount`
     - non-numeric counts
     - non-positive counts
   - Keep the existing shortfall-warning visibility test.

3. Add or update a regression for provider placement in `components/ui/notification-provider.test.tsx` and/or `components/ui/notification-provider.browser.spec.tsx`.
   - Assert the shared region uses `bottom-4` and no longer uses `top-4`.

4. Leave these specs intact and make sure they still pass unchanged after the provider move:
   - `app/(app)/app/bookmarks/bookmarks-toast.browser.spec.tsx:6-25`
   - `app/(app)/app/practice/components/practice-view-notification.browser.spec.tsx:45-114`
   - These are the guardrails that prove other toast consumers remain functional.

## Scope

- **Toast positioning:** `components/ui/notification-provider.tsx:128-149` — one shared placement change affects all toasts app-wide
- **Session-start routing:** `app/(app)/app/practice/practice-page-session-start.ts:114-119`
- **Session-start toast logic:** `app/(app)/app/practice/[sessionId]/practice-session-toast.tsx:35-67`
- **Layout context:** `app/(app)/app/layout.tsx:75-128` plus `components/auth-nav.tsx:75-95`, `components/mobile-nav.tsx:26-30` and `:107-121`, `components/theme-toggle.tsx:21-27`

## Acceptance Criteria

- [ ] Successful session starts with no shortfall do not emit a toast
- [ ] Shared toasts render at the bottom of the viewport instead of overlapping the header/nav
- [ ] The `"Only X of Y questions matched..."` warning still appears when `actualCount < requestedCount`
- [ ] Bookmark toasts (`Bookmark removed.`, practice bookmark success/error) still render correctly
- [ ] Toast positioning works on both mobile and desktop viewports
