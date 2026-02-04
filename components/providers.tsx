'use client';

import { dark } from '@clerk/themes';
import dynamic from 'next/dynamic';

const ClerkProvider = dynamic(
  () => import('@clerk/nextjs').then((m) => m.ClerkProvider),
  { ssr: false },
);

const CLERK_APPEARANCE = {
  baseTheme: dark,
  variables: {
    colorBackground: '#121212',
    colorPrimary: '#e4e4e7',
    colorText: '#ededed',
    colorTextSecondary: '#737373',
    borderRadius: '0.75rem',
  },
} as const;

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

  return (
    <ClerkProvider
      signInFallbackRedirectUrl="/app/dashboard"
      signUpFallbackRedirectUrl="/app/dashboard"
      appearance={CLERK_APPEARANCE}
    >
      {children}
    </ClerkProvider>
  );
}
