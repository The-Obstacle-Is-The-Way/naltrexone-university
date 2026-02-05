# DEBT-103: Next.js Scroll Behavior Warning

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

Next.js emits a warning about smooth scroll behavior on the `<html>` element:

```
Detected `scroll-behavior: smooth` on the `<html>` element.
To disable smooth scrolling during route transitions, add `data-scroll-behavior="smooth"` to your <html> element.
Learn more: https://nextjs.org/docs/messages/missing-data-scroll-behavior
```

This is a minor console warning that does not affect functionality but indicates we should follow Next.js best practices for scroll behavior.

---

## Impact

- Console noise during development
- Potential for unexpected scroll behavior during route transitions
- Minor deviation from Next.js recommended patterns

---

## Resolution

Add `data-scroll-behavior="smooth"` attribute to the `<html>` element in `app/layout.tsx`:

```tsx
<html lang="en" data-scroll-behavior="smooth" className={...}>
```

This tells Next.js to preserve smooth scrolling while properly handling route transitions.

---

## Verification

- [x] `data-scroll-behavior="smooth"` added to `<html>` element
- [x] Warning no longer appears in console
- [x] Smooth scrolling still works for anchor links
- [x] Route transitions work correctly

---

## Related

- Next.js documentation: https://nextjs.org/docs/messages/missing-data-scroll-behavior
- `app/layout.tsx` - root layout file
