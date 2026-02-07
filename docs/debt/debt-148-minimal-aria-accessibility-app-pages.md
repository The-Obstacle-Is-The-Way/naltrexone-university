# DEBT-148: Minimal ARIA Accessibility in App Pages

**Status:** In Progress
**Priority:** P3
**Date:** 2026-02-07

---

## Description

Initial audit findings were overstated. The app already has meaningful accessibility primitives in place (landmarks, nav labels, focus-visible styles, icon button labels in core nav/theme controls, `aria-live` in loading components). Remaining gaps are focused, not systemic.

## Impact

- Some practice-flow dynamic status regions lacked explicit live/alert semantics
- Some form inputs relied on visual text instead of explicit `<label>` association

## Gaps Identified

| Gap | Examples | Status |
|-----|----------|--------|
| Missing explicit label association | Practice session count input | Fixed |
| Missing status semantics | Session/tag loading and history-breakdown loading messages | Fixed |
| Missing alert semantics | Session/tag/history error messages in practice flow | Fixed |
| Broader WCAG audit baseline | Full Lighthouse + keyboard walkthrough for all app routes | Pending |

## Resolution

1. Keep adding explicit live-region semantics for new async UI states
2. Enforce explicit `<label>`/`htmlFor` wiring for new form inputs
3. Run a dedicated accessibility pass (Lighthouse + keyboard + screen reader smoke checks) before broad UI refactors ship

## Verification

- [x] Practice starter input now has explicit `<label htmlFor>` + input `id`
- [x] Practice loading/error states now expose semantic live/alert regions (`<output aria-live="polite">` and `role="alert"`) where applicable
- [ ] Lighthouse and manual assistive-tech audit checklist completed for all primary app routes

## Related

- DEBT-063 (archived): Missing ARIA labels on choice buttons — partially addressed
- DEBT-064 (archived): Missing focus indicators on error page buttons — resolved
- WCAG 2.1 AA compliance target
