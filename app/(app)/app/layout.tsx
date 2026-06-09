import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { manageBillingAction } from '@/app/(app)/app/billing/manage-billing-actions';
import { AppDesktopNav } from '@/components/app-desktop-nav';
import { AuthNav } from '@/components/auth-nav';
import { IdempotencyKeyField } from '@/components/idempotency-key-field';
import { MobileNav } from '@/components/mobile-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { getRequestAuthState } from '@/lib/auth-request-cache';
import { ROUTES } from '@/lib/routes';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { CheckEntitlementUseCase } from '@/src/application/ports/use-cases';
import type { SubscriptionStatus } from '@/src/domain/value-objects';
import { awaitRequestBoundary } from './request-boundary';

// Shared layout executes auth/entitlement checks on every app route request.
// Explicitly cap server-rendered work to avoid Vercel Fluid Compute defaults.
export const maxDuration = 30;

export type AppLayoutDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
};

export type EntitledAppUser = {
  subscriptionStatus: SubscriptionStatus | null;
  trialEndsAt: Date | null;
};

export async function enforceEntitledAppUser(
  deps?: AppLayoutDeps,
  redirectFn: (url: string) => never = redirect,
): Promise<EntitledAppUser> {
  const authState = await getRequestAuthState({ deps });

  if (!authState.user) {
    throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
  }

  if (!authState.entitlement.isEntitled) {
    const reason = authState.entitlement.reason ?? 'subscription_required';
    redirectFn(`${ROUTES.PRICING}?reason=${reason}`);
  }

  return {
    subscriptionStatus: authState.entitlement.subscriptionStatus ?? null,
    trialEndsAt: authState.entitlement.trialEndsAt ?? null,
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days remaining before the trial ends; any partial day counts as a
 * full day so a trial that ends tomorrow morning still reads "1 day left".
 */
export function getTrialDaysLeft(trialEndsAt: Date, now: Date): number {
  return Math.ceil((trialEndsAt.getTime() - now.getTime()) / MS_PER_DAY);
}

export type AppLayoutShellProps = {
  children: React.ReactNode;
  mobileNav: React.ReactNode;
  authNav: React.ReactNode;
  banner?: React.ReactNode;
};

export function AppLayoutShell({
  children,
  mobileNav,
  authNav,
  banner,
}: AppLayoutShellProps) {
  return (
    <div className="flex h-dvh min-h-screen flex-col bg-background">
      {banner}
      <header className="relative border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link
              href={ROUTES.APP_DASHBOARD}
              className="rounded-md text-base font-bold font-heading whitespace-nowrap text-foreground transition-colors hover:text-foreground/80 ring-focus"
            >
              Addiction Boards
            </Link>
            <AppDesktopNav />
          </div>
          <div className="flex items-center gap-2">
            {mobileNav}
            <ThemeToggle />
            {authNav}
          </div>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8"
      >
        <Suspense
          fallback={
            <output
              className="text-sm text-muted-foreground"
              aria-live="polite"
            >
              Loading app content…
            </output>
          }
        >
          {children}
        </Suspense>
      </main>
    </div>
  );
}

// Pattern Registry F-10: layout-level informational banner (DEBT-410).
export function TrialCountdownBanner({
  daysLeft,
  manageBillingActionFn,
}: {
  daysLeft: number;
  manageBillingActionFn: (formData: FormData) => Promise<void>;
}) {
  const countdown =
    daysLeft === 1 ? '1 day left in trial' : `${daysLeft} days left in trial`;
  return (
    // Server-rendered at page load; no live-region role needed.
    <div className="block border-b border-border bg-card px-4 py-3 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3">
        <span className="font-medium text-foreground">{countdown}</span>
        <form action={manageBillingActionFn}>
          <IdempotencyKeyField />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="rounded-full"
          >
            Add a card to keep access
          </Button>
        </form>
      </div>
    </div>
  );
}

export function PastDueBanner() {
  return (
    // Server-rendered at page load; no live-region role needed.
    <div className="block border-b border-warning bg-warning/10 px-4 py-3 text-center text-sm text-warning-foreground">
      Your payment failed — please{' '}
      <Link
        href={ROUTES.APP_BILLING}
        className="underline font-medium transition-colors hover:text-foreground"
      >
        update your billing information
      </Link>
      .
    </div>
  );
}

export async function renderAppLayout(input: {
  children: React.ReactNode;
  enforceEntitledAppUserFn?: () => Promise<EntitledAppUser>;
  authNavFn?: () => Promise<React.ReactNode>;
  mobileNav?: React.ReactNode;
  manageBillingActionFn?: (formData: FormData) => Promise<void>;
  nowFn?: () => Date;
}): Promise<React.ReactElement> {
  const enforceEntitledAppUserFn =
    input.enforceEntitledAppUserFn ?? enforceEntitledAppUser;
  const authNavFn =
    input.authNavFn ?? (() => AuthNav({ showPrimaryLink: false }));
  const mobileNav = input.mobileNav ?? <MobileNav />;
  const manageBillingActionFn =
    input.manageBillingActionFn ?? manageBillingAction;
  const nowFn = input.nowFn ?? (() => new Date());

  const [{ subscriptionStatus, trialEndsAt }, authNav] = await Promise.all([
    enforceEntitledAppUserFn(),
    authNavFn(),
  ]);
  const banner =
    subscriptionStatus === 'pastDue' ? (
      <PastDueBanner />
    ) : subscriptionStatus === 'inTrial' && trialEndsAt ? (
      <TrialCountdownBanner
        daysLeft={getTrialDaysLeft(trialEndsAt, nowFn())}
        manageBillingActionFn={manageBillingActionFn}
      />
    ) : undefined;

  return (
    <AppLayoutShell authNav={authNav} mobileNav={mobileNav} banner={banner}>
      {input.children}
    </AppLayoutShell>
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await awaitRequestBoundary();
  return renderAppLayout({ children });
}
