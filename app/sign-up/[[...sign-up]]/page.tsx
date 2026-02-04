'use client';

import dynamic from 'next/dynamic';

const SignUp = dynamic(() => import('@clerk/nextjs').then((m) => m.SignUp), {
  ssr: false,
});

export default function SignUpPage() {
  const skipClerk = process.env.NEXT_PUBLIC_SKIP_CLERK === 'true';

  if (skipClerk) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Sign Up</h1>
          <p className="mt-2 text-muted-foreground">
            Authentication unavailable in this environment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <SignUp
        appearance={{
          variables: {
            colorBackground: '#1c1c1c',
            colorPrimary: '#e4e4e7',
            colorText: '#ededed',
            colorTextSecondary: '#737373',
            borderRadius: '0.75rem',
          },
        }}
      />
    </div>
  );
}
