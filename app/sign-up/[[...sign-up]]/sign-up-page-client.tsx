'use client';

import dynamic from 'next/dynamic';

const SignUp = dynamic(() => import('@clerk/nextjs').then((m) => m.SignUp), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[200px] items-center justify-center">
      <p className="text-base text-muted-foreground">Loading sign-up…</p>
    </div>
  ),
});

export default function SignUpPageClient() {
  const skipClerk = process.env.NEXT_PUBLIC_SKIP_CLERK === 'true';

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center bg-background"
    >
      {skipClerk ? (
        <div className="text-center">
          <h1 className="text-xl font-semibold font-heading tracking-tight text-foreground">
            Sign Up
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Authentication unavailable in this environment.
          </p>
        </div>
      ) : (
        <SignUp />
      )}
    </main>
  );
}
