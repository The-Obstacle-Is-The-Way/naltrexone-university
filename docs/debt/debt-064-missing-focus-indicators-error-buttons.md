# DEBT-064: Missing Focus Indicators on Error Page Buttons

## Category: Accessibility

## Summary
The "Try again" buttons on error pages lack visible focus indicators. Keyboard users cannot see which element is focused.

## Location
- `app/error.tsx:20-26`
- `app/global-error.tsx:22-28`

## Current Code
```typescript
// error.tsx
<button
  onClick={() => reset()}
  className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
>
  Try again
</button>
```

No `focus:ring`, `focus-visible:ring`, or other focus indicator classes.

## Impact
- **WCAG 2.1 violation:** SC 2.4.7 Focus Visible (Level AA)
- **Keyboard navigation:** Users can't see where they are
- **Accessibility audit failure:** Common audit finding

## Effort: Trivial

## Recommended Fix
```typescript
<button
  onClick={() => reset()}
  className="rounded-md bg-primary px-4 py-2 text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
>
  Try again
</button>
```

Or use shadcn/ui Button component which includes focus styles:
```typescript
import { Button } from '@/components/ui/button';

<Button onClick={() => reset()}>Try again</Button>
```

## Related
- WCAG 2.1 SC 2.4.7
- DEBT-063: Missing ARIA labels
