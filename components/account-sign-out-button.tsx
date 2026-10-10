'use client';

import { useClerk } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Signs the person out, then opens the given page. For a page outside the app
 * shell, which has no account menu (DEBT-501 item 5).
 */
export function AccountSignOutButton({
  redirectUrl,
  children,
}: {
  redirectUrl: string;
  children: ReactNode;
}) {
  const { signOut } = useClerk();
  return (
    <Button type="button" onClick={() => void signOut({ redirectUrl })}>
      {children}
    </Button>
  );
}
