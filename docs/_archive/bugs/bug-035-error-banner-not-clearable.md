# BUG-035: Error Banner Not Clearable on Pricing Page

**Status:** Resolved
**Priority:** P3 - Low
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary
After a checkout error redirects to `/pricing?checkout=error`, the error banner displays but users have no way to dismiss it without manually editing the URL.

## Location
- `app/pricing/page.tsx`
- `app/pricing/pricing-view.tsx`
- `app/pricing/pricing-client.tsx`

## Root Cause
The banner was controlled entirely by URL query parameter with no dismiss mechanism.

## Fix
1. Extracted `PricingView` to `pricing-view.tsx` with `onDismissBanner` prop
2. Created `PricingClient` client component that manages banner state with `useState`
3. When dismiss button clicked, state is cleared (banner disappears)

**pricing-view.tsx:**
```typescript
export type PricingViewProps = {
  // ...
  onDismissBanner?: () => void;
};

// In banner JSX:
{banner && (
  <div className={bannerClasses} role="alert">
    <span>{banner.message}</span>
    {onDismissBanner ? (
      <button
        type="button"
        onClick={onDismissBanner}
        className="ml-4 text-current hover:opacity-70"
        aria-label="Dismiss"
      >
        ×
      </button>
    ) : null}
  </div>
)}
```

**pricing-client.tsx:**
```typescript
export function PricingClient({ initialBanner, ... }) {
  const [banner, setBanner] = useState<PricingBanner | null>(initialBanner);

  return (
    <PricingView
      banner={banner}
      onDismissBanner={() => setBanner(null)}
      ...
    />
  );
}
```

## Verification
- [x] Unit tests added (`page.test.tsx`)
  - Renders dismiss button when `onDismissBanner` provided
  - Does not render dismiss button when `onDismissBanner` not provided
- [x] TypeScript compilation passes
- [x] Build succeeds
- [x] Manual test: Click × button, banner disappears

## Related
- BUG-036: No loading state on subscribe buttons
