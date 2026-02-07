# DEBT-152: Home Route Literals Remain Outside `ROUTES` Constants

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-07

---

## Description

`ROUTES.HOME` is defined in `lib/routes.ts`, but production UI still includes direct `"/"` literals in multiple files.

Validated from first principles:

- `app/not-found.tsx:22` → `href="/"`
- `app/error.tsx:37` → `href="/"`
- `app/global-error.tsx:38` → `<a href="/">`
- `app/pricing/pricing-view.tsx:179` → `href="/"`
- `components/marketing/marketing-home.tsx:63` → `href="/"`

## Impact

- Route policy drift: route constants are not consistently authoritative
- Increases manual edit surface if home route behavior/path changes
- Contradicts the maintainability goal established by prior hard-coded-route fixes

## Resolution

1. Replace direct `"/"` usage with `ROUTES.HOME` where Next `Link` is used
2. For `app/global-error.tsx`, either:
   - keep `<a>` intentionally (hard reload semantics) and document exception, or
   - switch to `Link` + `ROUTES.HOME` if reload behavior is not required
3. Add a lightweight static regression check to prevent route-literal drift outside approved exceptions

## Verification

- [x] No direct `href="/"` remains in production code except documented exceptions
- [x] `ROUTES.HOME` used consistently for internal home navigation
- [x] Regression check/audit command documented in the bug/debt workflow (`rg -n 'href=\"/\"' app components`)
- [x] `pnpm typecheck && pnpm lint && pnpm test --run`

**Note:** `app/global-error.tsx` uses `<a href={ROUTES.HOME}>` (not `<Link>`) intentionally — global error replaces the root layout so the Next.js router may not be available. The `ROUTES.HOME` constant is still used for consistency.

## Related

- `lib/routes.ts`
- `docs/_archive/bugs/bug-097-widespread-hard-coded-route-strings.md`
