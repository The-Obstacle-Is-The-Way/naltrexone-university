import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AppDesktopNav } from '@/components/app-desktop-nav';
import { AuthNav } from '@/components/auth-nav';
import { MobileNav } from '@/components/mobile-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { ROUTES } from '@/lib/routes';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { CheckEntitlementUseCase } from '@/src/application/ports/use-cases';

// Auth-gated routes must be dynamic to avoid build-time prerendering.
export const dynamic = 'force-dynamic';

export type AppLayoutDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
};

async function getDeps(deps?: AppLayoutDeps): Promise<AppLayoutDeps> {
  if (deps) return deps;

  const { createContainer } = await import('@/lib/container');
  const container = createContainer();

  return {
    authGateway: container.createAuthGateway(),
    checkEntitlementUseCase: container.createCheckEntitlementUseCase(),
  };
}

export type EntitledAppUser = {
  subscriptionStatus: string | null;
};

export async function enforceEntitledAppUser(
  deps?: AppLayoutDeps,
  redirectFn: (url: string) => never = redirect,
): Promise<EntitledAppUser> {
  const d = await getDeps(deps);
  const user = await d.authGateway.requireUser();

  const entitlement = await d.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  if (!entitlement.isEntitled) {
    const reason = entitlement.reason ?? 'subscription_required';
    redirectFn(`${ROUTES.PRICING}?reason=${reason}`);
  }

  return { subscriptionStatus: entitlement.subscriptionStatus ?? null };
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
    <div className="min-h-screen bg-muted">
      {banner}
      <header className="relative border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link
              href={ROUTES.APP_DASHBOARD}
              className="text-sm font-semibold text-foreground"
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
    <output className="block border-b border-warning bg-warning/10 px-4 py-3 text-center text-sm text-warning-foreground">
      Your payment failed — please{' '}
      <Link
        href={ROUTES.APP_BILLING}
        className="underline font-medium hover:text-foreground"
      >
        update your billing information
      </Link>
      .
    </output>
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
  const authNavFn = input.authNavFn ?? AuthNav;
  const mobileNav = input.mobileNav ?? <MobileNav />;

  const { subscriptionStatus } = await enforceEntitledAppUserFn();
  const authNav = await authNavFn();
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
  return renderAppLayout({ children });
}
