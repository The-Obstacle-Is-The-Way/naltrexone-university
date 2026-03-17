# DEBT-319: Lucide icon size shorthand drift in disclosure chevrons

**Priority:** P3
**Created:** 2026-03-17
**Related:** [Frontend Standards](../frontend/standards.md), [Pattern Registry](../frontend/pattern-registry.md), [Practice Page](../frontend/pages/practice.md)

---

## Problem

The frontend standard for Lucide sizing is explicit: use the `size-*` shorthand (`size-4`, `size-5`, `size-6`) instead of paired `h-* w-*` utilities.

That standard is currently violated in two production disclosure chevrons. The docs now reflect the canonical `size-4` form, but the code still uses `h-4 w-4`, which reintroduces low-value styling drift in otherwise shared UI patterns.

## Verified Current Behavior

- `app/(app)/app/practice/components/practice-session-starter.tsx`
  - Topic / Substance / Treatment disclosure chevron uses `h-4 w-4 text-foreground/60 transition-transform group-open:rotate-180`
- `app/(app)/app/history/components/history-sessions-tab.tsx`
  - Session breakdown chevron uses `h-4 w-4 text-foreground/60 transition-transform`
- `docs/frontend/standards.md` already defines `size-*` as the canonical Lucide sizing rule
- `docs/frontend/pattern-registry.md` and `docs/frontend/pages/practice.md` now document the ideal `size-4` contract

## Expected Behavior

- Disclosure chevrons should use `size-4`, not `h-4 w-4`
- The icon-sizing convention should be uniform across app-shell, disclosure, and question-flow surfaces
- Future frontend docs should keep documenting the ideal shorthand form rather than mirroring local drift

## Scope

- **Production files:**
  - `app/(app)/app/practice/components/practice-session-starter.tsx`
  - `app/(app)/app/history/components/history-sessions-tab.tsx`
- **Expected change:** replace `h-4 w-4` with `size-4` while preserving the existing color/rotation classes
- **Verification:** targeted component tests or static render assertions are sufficient; no behavioral change is expected

## Notes

- This is a consistency / standards-compliance debt, not a functional bug
- The goal is to keep the code aligned with the documented frontend contract so new UI work copies the same canonical pattern everywhere
