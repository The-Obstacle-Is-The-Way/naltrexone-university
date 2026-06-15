'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

const ClerkUserButton = dynamic(
  () => import('@clerk/nextjs').then((module) => module.UserButton),
  { ssr: false },
);

export type AuthUserButtonProps = {
  appearance?: ComponentProps<typeof ClerkUserButton>['appearance'] | undefined;
};

export function AuthUserButton({ appearance }: AuthUserButtonProps) {
  return (
    <div className="flex min-h-[44px] min-w-[44px] items-center justify-center">
      <ClerkUserButton {...(appearance !== undefined ? { appearance } : {})} />
    </div>
  );
}
