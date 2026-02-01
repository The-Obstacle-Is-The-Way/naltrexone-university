'use client';

import { ClerkProvider } from '@clerk/nextjs';

/**
 * Conditionally wrap children with ClerkProvider.
 * In CI environments with dummy keys, Clerk validation fails during static
 * page generation. This component skips the provider when NEXT_PUBLIC_SKIP_CLERK
 * is set, allowing builds to succeed without real Clerk credentials.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const skipClerk = process.env.NEXT_PUBLIC_SKIP_CLERK === 'true';

  if (skipClerk) {
    // Return children unwrapped for CI builds
    return <>{children}</>;
  }

  return <ClerkProvider>{children}</ClerkProvider>;
}
