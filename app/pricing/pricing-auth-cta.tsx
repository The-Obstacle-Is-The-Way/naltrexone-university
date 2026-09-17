import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { IdempotencyKeyField } from '@/components/idempotency-key-field';
import { Button } from '@/components/ui/button';

export type PricingAction = (formData: FormData) => Promise<void>;

type AuthAwareCtaProps = {
  isAuthenticated: boolean;
  formAction: PricingAction;
  signUpHref: string;
  children: ReactNode;
  formAriaLabel?: string;
  buttonProps?: Omit<
    ComponentProps<typeof Button>,
    'asChild' | 'children' | 'type'
  >;
};

export function AuthAwareCta({
  isAuthenticated,
  formAction,
  signUpHref,
  children,
  formAriaLabel,
  buttonProps,
}: AuthAwareCtaProps) {
  if (isAuthenticated) {
    return (
      <form action={formAction} aria-label={formAriaLabel}>
        <IdempotencyKeyField />
        <Button type="submit" {...buttonProps}>
          {children}
        </Button>
      </form>
    );
  }

  return (
    <Button asChild {...buttonProps}>
      <Link href={signUpHref}>{children}</Link>
    </Button>
  );
}
