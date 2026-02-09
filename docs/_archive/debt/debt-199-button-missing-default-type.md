# DEBT-199: Button Component Missing Default `type="button"`

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08
**Resolved:** 2026-02-09

---

## Description

The `Button` component (`components/ui/button.tsx`) does not set a default `type="button"` attribute. In HTML, a `<button>` without an explicit `type` defaults to `type="submit"`. Any `<Button>` used inside a `<form>` without explicitly setting `type="button"` will inadvertently submit the form.

## Affected Files

| File | Lines | Issue |
|------|-------|-------|
| `components/ui/button.tsx` | 38-57 | No default `type` prop |

## Impact

- Currently no known form-submission bugs (the app uses server actions rather than traditional form submission)
- However, this is a latent defect: any future `<Button>` inside a `<form>` will trigger form submission unless the developer remembers to add `type="button"`
- Most design system Button components (MUI, Chakra, Mantine) default to `type="button"` for this reason
- The shadcn/ui default also does not set this, so this is technically "upstream behavior"

## Resolution

Add `type="button"` as a default that can be overridden:

```tsx
<Comp
  data-slot="button"
  type={asChild ? undefined : "button"}
  className={cn(buttonVariants({ variant, size, className }))}
  {...props}
/>
```

Note: when `asChild` is true, the `Comp` is `Slot` and `type` should not be set (the child element controls it). The `...props` spread allows callers to override with `type="submit"` when needed.

## Verification

- [x] `pnpm typecheck && pnpm test --run`
- [x] Added regression coverage: `<Button>` defaults to `type="button"` and does not force a type when `asChild`
- [x] Verified explicit `<Button type="submit">` usages still override the default

## Related

- FE-007 (Button adoption — would be a good time to add this default)
