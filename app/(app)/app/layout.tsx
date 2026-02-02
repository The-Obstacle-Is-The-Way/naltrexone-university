import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthNav } from '@/components/auth-nav';
import { MobileNav } from '@/components/mobile-nav';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';

type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

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
    redirectFn('/pricing?reason=subscription_required');
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
            <nav className="hidden items-center gap-4 text-sm sm:flex">
              <Link
                href="/app/dashboard"
                className="text-muted-foreground hover:text-foreground"
              >
                Dashboard
              </Link>
              <Link
                href="/app/practice"
                className="text-muted-foreground hover:text-foreground"
              >
                Practice
              </Link>
              <Link
                href="/app/review"
                className="text-muted-foreground hover:text-foreground"
              >
                Review
              </Link>
              <Link
                href="/app/bookmarks"
                className="text-muted-foreground hover:text-foreground"
              >
                Bookmarks
              </Link>
              <Link
                href="/app/billing"
                className="text-muted-foreground hover:text-foreground"
              >
                Billing
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {mobileNav}
            {authNav}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await enforceEntitledAppUser();
  const authNav = await AuthNav();

  return (
    <AppLayoutShell authNav={authNav} mobileNav={<MobileNav />}>
      {children}
    </AppLayoutShell>
  );
}
