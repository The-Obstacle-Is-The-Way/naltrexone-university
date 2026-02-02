# BUG-034: Error Banner Not Clearable on Pricing Page

## Severity: P3 - Low

## Summary
After a checkout error redirects to `/pricing?checkout=error`, the error banner displays but users have no way to dismiss it without manually editing the URL.

## Location
- `app/pricing/page.tsx:177-224` (banner display logic)

## Current Behavior
```typescript
// URL: /pricing?checkout=error
const banner = getPricingBanner(searchParams);

// Banner rendered conditionally
{banner && (
  <div className={bannerClasses}>
    {banner.message}
    {/* No dismiss button */}
  </div>
)}
```

The banner is controlled by URL query parameter. User options:
1. Navigate away and come back (banner persists in browser history)
2. Manually edit URL to remove `?checkout=error`
3. Refresh (banner persists)

## Expected Behavior
Either:
1. Add a dismiss button that uses `router.replace('/pricing')` to clear the parameter
2. Auto-clear banner after a timeout (e.g., 5 seconds)
3. Use session storage instead of URL parameter

## Impact
- **Poor UX:** Users stuck seeing error message
- **Confusion:** "Did the error happen again?" when revisiting page
- **Browser history pollution:** Every error creates a new history entry

## Recommended Fix
**Option A:** Add dismiss button
```typescript
{banner && (
  <div className={bannerClasses}>
    {banner.message}
    <button
      onClick={() => router.replace('/pricing')}
      aria-label="Dismiss"
    >
      ×
    </button>
  </div>
)}
```

**Option B:** Auto-clear after timeout
```typescript
useEffect(() => {
  if (searchParams.checkout) {
    const timer = setTimeout(() => {
      router.replace('/pricing');
    }, 5000);
    return () => clearTimeout(timer);
  }
}, [searchParams.checkout]);
```

## Related
- BUG-021: Missing loading states on forms
