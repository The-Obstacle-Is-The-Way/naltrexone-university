# DEBT-067: Generic Error Page Lacks Error Details

## Category: UX / Debugging

## Summary
The error page shows "Something went wrong" with no context about what failed or how to resolve it. While the error is logged to console, users see only a generic message.

## Location
- `app/error.tsx:13-29`

## Current Code
```typescript
useEffect(() => {
  console.error(error);  // Logged but not shown
}, [error]);

return (
  <div>
    <h2>Something went wrong</h2>
    <button onClick={() => reset()}>Try again</button>
  </div>
);
```

## Impact
- **User confusion:** "What went wrong? Can I do anything?"
- **Support burden:** Users report "something went wrong" with no details
- **Debugging difficulty:** Users can't provide useful error info

## Effort: Low

## Recommended Fix
Add more context (while keeping sensitive details hidden):

```typescript
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="mt-2 text-muted-foreground">
        We encountered an unexpected error. Please try again.
      </p>

      {/* Show error digest for support tickets */}
      {error.digest && (
        <p className="mt-2 text-xs text-muted-foreground">
          Error ID: {error.digest}
        </p>
      )}

      <div className="mt-6 flex gap-4">
        <button
          onClick={() => reset()}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Try again
        </button>
        <Link href="/app/dashboard" className="rounded-md border px-4 py-2">
          Go to Dashboard
        </Link>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        If this problem persists, please contact support.
      </p>
    </div>
  );
}
```

## Security Note
Never expose full stack traces or internal error messages to users. Only show:
- Generic message
- Error digest/ID for tracking
- Actionable next steps

## Related
- DEBT-064: Missing focus indicators on error buttons
