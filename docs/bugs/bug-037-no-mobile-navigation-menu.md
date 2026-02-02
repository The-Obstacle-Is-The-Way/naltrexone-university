# BUG-037: No Mobile Navigation Menu

## Severity: P2 - Medium

## Summary
The app layout header navigation is hidden on mobile viewports (`hidden sm:flex`) with no hamburger menu alternative. Mobile users cannot access Dashboard, Practice, or Billing links from the header.

## Location
- `app/(app)/app/layout.tsx:65-84`

## Current Behavior
```typescript
<nav className="hidden items-center gap-4 text-sm sm:flex">
  <Link href="/app/dashboard" ...>Dashboard</Link>
  <Link href="/app/practice" ...>Practice</Link>
  <Link href="/app/billing" ...>Billing</Link>
</nav>
```

On mobile (< 640px breakpoint):
- Navigation links are completely hidden
- Only the "Addiction Boards" logo and AuthNav (Clerk user button) are visible
- Users must know URLs to navigate

## Expected Behavior
Mobile users should have a hamburger/drawer menu to access navigation:
1. Hamburger icon visible on mobile
2. Click opens drawer/dropdown with nav links
3. Links are touch-friendly (44px minimum target)

## Impact
- **Mobile unusable:** ~50%+ of users may be on mobile
- **Poor UX:** Users stuck on current page
- **Accessibility:** Violates WCAG navigation requirements

## Workaround (Current)
Mobile users can:
1. Type URLs manually in browser
2. Use AuthNav dropdown if it has navigation (it doesn't)
3. Use browser back button to navigate

## Recommended Fix
Add a mobile menu component:

```typescript
// components/MobileNav.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2"
        aria-label="Toggle navigation menu"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {isOpen && (
        <nav className="absolute left-0 right-0 top-full border-b bg-background p-4">
          <Link href="/app/dashboard" className="block py-3">Dashboard</Link>
          <Link href="/app/practice" className="block py-3">Practice</Link>
          <Link href="/app/billing" className="block py-3">Billing</Link>
        </nav>
      )}
    </div>
  );
}

// In layout.tsx
<header>
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-6">
      <Link href="/app/dashboard">Addiction Boards</Link>
      <nav className="hidden sm:flex">...</nav>
    </div>
    <div className="flex items-center gap-2">
      <MobileNav />
      <AuthNav />
    </div>
  </div>
</header>
```

## Related
- WCAG 2.1 SC 2.4.5: Multiple Ways (Level AA)
- DEBT-067: Touch targets too small
