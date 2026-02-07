# DEBT-146: Missing Semantic Success/Warning Color Tokens

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The Tailwind theme configuration defines semantic tokens for `destructive` (error), `primary`, `accent`, and `muted` states, but has **no tokens for success or warning states**. Components that show correct/incorrect feedback, savings badges, or warning banners resort to hardcoded emerald, red, and amber color classes.

## Impact

- Developers have no semantic option for success/warning colors, forcing hardcoded values
- Dark mode support for success/warning states is inconsistent and manually duplicated
- No single source of truth for what "correct answer green" or "past-due warning amber" looks like

## Affected Patterns

| State | Currently Used | Should Be |
|-------|---------------|-----------|
| Correct answer | `emerald-500`, `emerald-50` | `success`, `success-foreground` |
| Incorrect answer | `red-500`, `red-50` | `destructive` (already exists) |
| Warning banner | `amber-200`, `amber-50`, `amber-900` | `warning`, `warning-foreground` |
| Savings text | `emerald-600` | `success-foreground` |

## Resolution

1. Added semantic token variables to `app/globals.css`:
   - `--color-success`, `--color-success-foreground`
   - `--color-warning`, `--color-warning-foreground`
2. Defined light/dark `--success*` and `--warning*` values in `:root` / `.dark`
3. Adopted tokens in question feedback, billing warning UI, and pricing savings/error states

## Verification

- [x] `success`/`warning` utilities available via `@theme` color tokens
- [x] Light and dark values defined in `app/globals.css`
- [x] Consumers updated (see DEBT-144) and covered by regression tests
- [x] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- DEBT-144: Hardcoded colors bypass design system tokens (consumer of this fix)
- `tailwind.config.ts` — theme configuration
- `app/globals.css` — CSS custom property definitions
