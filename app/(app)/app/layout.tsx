import Link from 'next/link';
import { redirect } from 'next/navigation';
import { type CSSProperties, Suspense } from 'react';
import { AppDesktopNav } from '@/components/app-desktop-nav';
import { AuthNav } from '@/components/auth-nav';
import { MobileNav } from '@/components/mobile-nav';
import { ThemeToggle } from '@/components/theme-toggle';
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

const APP_SHELL_CHROME_HEIGHT = '8rem';
const appShellViewportOffsetStyle = {
  '--app-shell-chrome-height': APP_SHELL_CHROME_HEIGHT,
} as CSSProperties;

export type EntitledAppUser = {
  subscriptionStatus: SubscriptionStatus | null;
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
  };
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
    <div className="min-h-screen bg-background">
      {banner}
      <header className="relative border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link
              href={ROUTES.APP_DASHBOARD}
              className="rounded-md text-base font-bold font-heading whitespace-nowrap text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
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
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
        style={appShellViewportOffsetStyle}
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
}): Promise<React.ReactElement> {
  const enforceEntitledAppUserFn =
    input.enforceEntitledAppUserFn ?? enforceEntitledAppUser;
  const authNavFn =
    input.authNavFn ?? (() => AuthNav({ showPrimaryLink: false }));
  const mobileNav = input.mobileNav ?? <MobileNav />;

  const [{ subscriptionStatus }, authNav] = await Promise.all([
    enforceEntitledAppUserFn(),
    authNavFn(),
  ]);
  const banner =
    subscriptionStatus === 'pastDue' ? <PastDueBanner /> : undefined;

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
