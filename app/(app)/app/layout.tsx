import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AppDesktopNav } from '@/components/app-desktop-nav';
import { AuthNav } from '@/components/auth-nav';
import { MobileNav } from '@/components/mobile-nav';
import { ThemeToggle } from '@/components/theme-toggle';
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

export async function enforceEntitledAppUser(
  deps?: AppLayoutDeps,
  redirectFn: (url: string) => never = redirect,
): Promise<void> {
  const d = await getDeps(deps);
  const user = await d.authGateway.requireUser();

  const entitlement = await d.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  if (!entitlement.isEntitled) {
    const reason = entitlement.reason ?? 'subscription_required';
    redirectFn(`/pricing?reason=${reason}`);
  }
}

export type AppLayoutShellProps = {
  children: React.ReactNode;
  mobileNav: React.ReactNode;
  authNav: React.ReactNode;
};

export function AppLayoutShell({
  children,
  mobileNav,
  authNav,
}: AppLayoutShellProps) {
  return (
    <div className="min-h-screen bg-muted">
      <header className="relative border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link
              href="/app/dashboard"
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
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">
              Loading app content…
            </p>
          }
        >
          {children}
        </Suspense>
      </main>
    </div>
  );
}

export async function renderAppLayout(input: {
  children: React.ReactNode;
  enforceEntitledAppUserFn?: () => Promise<void>;
  authNavFn?: () => Promise<React.ReactNode>;
  mobileNav?: React.ReactNode;
}): Promise<React.ReactElement> {
  const enforceEntitledAppUserFn =
    input.enforceEntitledAppUserFn ?? enforceEntitledAppUser;
  const authNavFn = input.authNavFn ?? AuthNav;
  const mobileNav = input.mobileNav ?? <MobileNav />;

  await enforceEntitledAppUserFn();
  const authNav = await authNavFn();

  return (
    <AppLayoutShell authNav={authNav} mobileNav={mobileNav}>
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
