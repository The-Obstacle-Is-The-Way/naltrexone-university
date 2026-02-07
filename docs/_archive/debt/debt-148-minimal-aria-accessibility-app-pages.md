# DEBT-148: Minimal ARIA Accessibility in App Pages

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-07

---

## Description

A route-by-route accessibility sweep confirmed the app already had strong baseline semantics in most flows. Remaining gaps were narrow and concrete: a few routes lacked explicit `<main>` landmarks, and a handful of practice-flow loading/error regions still relied on visual text without explicit live/alert semantics.

## Impact

- Some practice-flow dynamic status regions lacked explicit live/alert semantics
- Some form inputs relied on visual text instead of explicit `<label>` association

## Gaps Identified

| Gap | Examples | Status |
|-----|----------|--------|
| Missing explicit `<main>` landmarks on top-level routes | Pricing, Sign In, Sign Up pages | Fixed |
| Missing explicit label association | Practice session count input | Fixed |
| Missing status semantics | Practice loading states, session summary loading, app Suspense fallback | Fixed |
| Missing alert semantics | Session summary breakdown error state | Fixed |

## Resolution

1. Added `<main id="main-content">` landmarks to pricing/sign-in/sign-up routes
2. Added explicit `aria-live="polite"` semantics for dynamic loading states in practice/question/session flows and app shell Suspense fallback
3. Added `role="alert"` for summary breakdown error messaging
4. Preserved existing explicit label wiring (`label` + `htmlFor`) for user-editable form inputs

## Verification

- [x] Practice starter input now has explicit `<label htmlFor>` + input `id`
- [x] Practice/question/session loading and error states expose semantic live/alert regions (`<output aria-live="polite">` and `role="alert"`) where applicable
- [x] Primary route landmarks verified and fixed where missing (`main`, `header`, `nav`)
- [x] Regression tests added/updated for landmark and live-region semantics in affected routes/components

## Related

- DEBT-063 (archived): Missing ARIA labels on choice buttons — partially addressed
- DEBT-064 (archived): Missing focus indicators on error page buttons — resolved
- WCAG 2.1 AA compliance target
