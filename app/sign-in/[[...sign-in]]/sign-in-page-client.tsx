'use client';

import dynamic from 'next/dynamic';

const SignIn = dynamic(() => import('@clerk/nextjs').then((m) => m.SignIn), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[200px] items-center justify-center">
      <p className="text-base text-muted-foreground">Loading sign-in…</p>
    </div>
  ),
});

export default function SignInPageClient() {
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
            Sign In
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Authentication unavailable in this environment.
          </p>
        </div>
      ) : (
        <SignIn />
      )}
    </main>
  );
}
