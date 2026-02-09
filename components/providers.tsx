'use client';

import { dark, shadcn } from '@clerk/themes';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useMemo } from 'react';
import { NotificationProvider } from '@/components/ui/notification-provider';
import { ROUTES } from '@/lib/routes';

const ClerkProvider = dynamic(
  () => import('@clerk/nextjs').then((m) => m.ClerkProvider),
  { ssr: false },
);

const CLERK_APPEARANCE_DARK = {
  baseTheme: dark,
  variables: {
    colorBackground: '#121212',
    colorPrimary: '#e4e4e7',
    colorText: '#ededed',
    colorTextSecondary: '#737373',
    borderRadius: '0.75rem',
  },
} as const;

const CLERK_APPEARANCE_LIGHT = {
  baseTheme: shadcn,
  variables: {
    colorBackground: '#ffffff',
    colorPrimary: '#111827',
    colorText: '#09090b',
    colorTextSecondary: '#71717a',
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
  const { resolvedTheme } = useTheme();
  const skipClerk = process.env.NEXT_PUBLIC_SKIP_CLERK === 'true';
  const clerkAppearance = useMemo(() => {
    return resolvedTheme === 'dark'
      ? CLERK_APPEARANCE_DARK
      : CLERK_APPEARANCE_LIGHT;
  }, [resolvedTheme]);

  if (skipClerk) {
    // Return children unwrapped for CI builds
    return <NotificationProvider>{children}</NotificationProvider>;
  }

  return (
    <NotificationProvider>
      <ClerkProvider
        signInFallbackRedirectUrl={ROUTES.APP_DASHBOARD}
        signUpFallbackRedirectUrl={ROUTES.APP_DASHBOARD}
        appearance={clerkAppearance}
      >
        {children}
      </ClerkProvider>
    </NotificationProvider>
  );
}
