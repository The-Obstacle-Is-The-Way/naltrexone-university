'use client';

import dynamic from 'next/dynamic';

const SignUp = dynamic(() => import('@clerk/nextjs').then((m) => m.SignUp), {
  ssr: false,
});

export default function SignUpPage() {
  const skipClerk = process.env.NEXT_PUBLIC_SKIP_CLERK === 'true';

  if (skipClerk) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
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
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp />
    </div>
  );
}
