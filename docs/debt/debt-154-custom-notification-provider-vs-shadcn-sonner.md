# DEBT-154: Custom NotificationProvider vs shadcn/sonner

**Status:** Open
**Priority:** P4
**Date:** 2026-02-07

---

## Description

DEBT-151 was resolved by building a custom 129-line `NotificationProvider` (`components/ui/notification-provider.tsx`) instead of adopting `shadcn/sonner`, the ecosystem-standard toast library. The custom implementation is clean, tested, and working — but it adds a maintenance surface that grows with each new consumer.

This is a tracking item, not a defect. The decision was reasonable at the time (1 consumer, zero dependencies). It becomes debt if/when the toast system needs features that sonner provides out of the box.

## Current State

| Aspect | Custom Provider | shadcn/sonner |
|--------|----------------|---------------|
| Dependencies | 0 | 1 (`sonner`) |
| Bundle size | ~2KB | ~15KB |
| Production consumers | 1 (`practice-view.tsx`) | N/A |
| API surface | `notify({ message, tone, durationMs })` | `toast.success()`, `.error()`, `.loading()`, `.promise()`, custom JSX |
| ARIA semantics | Manual (`aria-live`, `role="status"/"alert"`) | Built-in |
| Stacking/queuing | Basic vertical stack | Queue with animations |
| Promise toasts | No | Yes |
| Action buttons in toasts | No | Yes |
| Undo support | No | Yes |

## Trigger for migration

Migrate to sonner when **any** of these become true:

1. **3+ distinct consumers** call `notify()` across different features (currently: 1)
2. **Promise-based toasts** are needed (e.g., "Saving..." → "Saved!" for async operations)
3. **Action buttons** in toasts are needed (e.g., "Undo" for destructive actions)
4. **SPEC-020 Phase 2+** ships features that generate multiple transient feedback events per user flow

Until then, the custom provider is the right size for the problem.

## Migration path (when triggered)

1. `pnpm add sonner`
2. `npx shadcn@latest add sonner` — scaffolds `components/ui/sonner.tsx`
3. Replace `<NotificationProvider>` in `components/providers.tsx` with `<Toaster position="top-center" />`
4. Replace `useNotification().notify({ message, tone })` calls with `toast.success(message)` / `toast.error(message)`
5. Delete `components/ui/notification-provider.tsx` and its test
6. Update browser spec mocks if needed

Estimated effort: ~1 hour, ~6 files.

## Verification

- [ ] Migration trigger condition met
- [ ] sonner installed and Toaster component wired
- [ ] All existing `notify()` calls migrated
- [ ] Custom NotificationProvider deleted
- [ ] Toast accessibility preserved (ARIA live region, auto-dismiss, keyboard)
- [ ] No regressions in test suite

## Related

- DEBT-151 (archived): No toast/notification system — resolved with custom provider
- DEBT-066 (archived): No success toast for bookmark action — predecessor
- SPEC-020 Phase 2+: Will add more transient feedback events
- `components/ui/notification-provider.tsx` — current implementation
- `components/providers.tsx` — provider wiring
