'use client';

import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import Link from 'next/link';

/**
 * Auth-aware navigation component.
 *
 * In CI environments with NEXT_PUBLIC_SKIP_CLERK=true, renders an unauthenticated
 * fallback UI. This allows static page generation without valid Clerk credentials.
 *
 * In production/development with real Clerk keys, renders the full auth UI.
 */
export function AuthNav() {
  const skipClerk = process.env.NEXT_PUBLIC_SKIP_CLERK === 'true';

  if (skipClerk) {
    // CI fallback: render unauthenticated state
    return (
      <div className="flex items-center space-x-4">
        <Link
          href="/pricing"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Pricing
        </Link>
        <Link
          href="/sign-in"
          className="rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-4">
      <SignedOut>
        <Link
          href="/pricing"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Pricing
        </Link>
        <Link
          href="/sign-in"
          className="rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Sign In
        </Link>
      </SignedOut>
      <SignedIn>
        <Link
          href="/pricing"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Pricing
        </Link>
        <UserButton />
      </SignedIn>
    </div>
  );
}
