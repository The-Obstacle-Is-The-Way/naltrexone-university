'use client';

import { useClerk } from '@clerk/nextjs';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Signs the person out, then opens the given page. For a page outside the app
 * shell, which has no account menu (DEBT-501 item 5). While Clerk works the
 * button says so; a sign-out that fails says so too and can be tried again,
 * beside the page's Contact support.
 */
export function AccountSignOutButton({
  redirectUrl,
  children,
}: {
  redirectUrl: string;
  children: ReactNode;
}) {
  const { signOut } = useClerk();
  const [status, setStatus] = useState<'idle' | 'signing-out' | 'failed'>(
    'idle',
  );
  const signOutAndRedirect = async () => {
    setStatus('signing-out');
    try {
      await signOut({ redirectUrl });
    } catch {
      setStatus('failed');
    }
  };
  return (
    <>
      <Button
        type="button"
        disabled={status === 'signing-out'}
        onClick={() => void signOutAndRedirect()}
      >
        {status === 'signing-out' ? 'Signing out…' : children}
      </Button>
      {status === 'failed' ? (
        <p className="basis-full text-sm text-destructive" role="alert">
          Sign-out did not finish. Try again, or use Contact support.
        </p>
      ) : null}
    </>
  );
}
