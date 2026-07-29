import Link from 'next/link';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
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
  AuthenticatedButtonComponent?: ComponentType<{ children: ReactNode }>;
  footer?: ReactNode;
};

export function AuthAwareCta({
  isAuthenticated,
  formAction,
  signUpHref,
  children,
  formAriaLabel,
  buttonProps,
  AuthenticatedButtonComponent,
  footer,
}: AuthAwareCtaProps) {
  if (isAuthenticated) {
    return (
      <form action={formAction} aria-label={formAriaLabel}>
        <IdempotencyKeyField />
        {AuthenticatedButtonComponent ? (
          <AuthenticatedButtonComponent>
            {children}
          </AuthenticatedButtonComponent>
        ) : (
          <Button type="submit" {...buttonProps}>
            {children}
          </Button>
        )}
        {footer}
      </form>
    );
  }

  return (
    <>
      <Button asChild {...buttonProps}>
        <Link href={signUpHref}>{children}</Link>
      </Button>
      {footer}
    </>
  );
}

export function SubscribePlanCta({
  isAuthenticated,
  formAction,
  signUpHref,
  formAriaLabel,
  label,
  disclosure,
  SubscribeButtonComponent,
}: {
  isAuthenticated: boolean;
  formAction: PricingAction;
  signUpHref: string;
  formAriaLabel: string;
  label: string;
  disclosure: string;
  SubscribeButtonComponent: ComponentType<{ children: ReactNode }>;
}) {
  return (
    <div className="mt-6">
      <p className="rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed text-foreground">
        {disclosure}
      </p>
      <AuthAwareCta
        isAuthenticated={isAuthenticated}
        formAction={formAction}
        signUpHref={signUpHref}
        formAriaLabel={formAriaLabel}
        AuthenticatedButtonComponent={SubscribeButtonComponent}
        buttonProps={{
          className: 'mt-4 h-auto w-full rounded-full py-3 text-base',
        }}
      >
        {label}
      </AuthAwareCta>
    </div>
  );
}
