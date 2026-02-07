# DEBT-145: Shadcn Card Adoption Is Incomplete Across App Pages

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The codebase has properly configured shadcn/ui `Card` (`components/ui/card.tsx`) and `Input` (`components/ui/input.tsx`) components, but card adoption is still partial across app pages. Many pages still duplicate inline Tailwind card containers:

```tsx
// This pattern appears 50+ times:
<div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
```

This defeats the purpose of having a component library and creates a maintenance burden.

## Resolution

Resolved by migrating app-route inline card wrappers to the shared `Card` primitive and adding a regression test that fails if the old wrapper pattern reappears.

### Code Changes

- Migrated app-route card wrappers to `Card` in:
  - `app/(app)/app/billing/page.tsx`
  - `app/(app)/app/bookmarks/page.tsx`
  - `app/(app)/app/dashboard/page.tsx`
  - `app/(app)/app/review/page.tsx`
  - `app/(app)/app/questions/[slug]/question-page-client.tsx`
  - `app/(app)/app/practice/components/practice-view.tsx`
  - `app/(app)/app/practice/components/practice-session-history-panel.tsx`
  - `app/(app)/app/practice/components/incomplete-session-card.tsx`
  - `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`
  - `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`
  - `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`
- Added regression test:
  - `app/(app)/app/card-adoption-regression.test.ts`
  - Asserts no app-route component contains the old inline wrapper pattern.

## Impact

- **Consistency drift:** Some cards use `p-4`, others `p-6`, others `p-8` — no single source of truth
- **Change amplification:** Updating card styling requires manual changes across 50+ instances

## Verification

- [x] Practice session starter uses `<Card>` and `<Input>`
- [x] Remaining app-route card containers migrated off the old inline wrapper pattern
- [x] Regression test added (`app/(app)/app/card-adoption-regression.test.ts`)
- [x] `pnpm typecheck && pnpm lint && pnpm test --run` passes (2026-02-07)

## Related

- `components/ui/card.tsx` — existing Card component
- `components/ui/input.tsx` — existing Input component
- DEBT-144: Hardcoded colors bypass design system
