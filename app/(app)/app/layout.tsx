import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/app-shell';
import { AuthNav } from '@/components/auth-nav';
import { MobileNav } from '@/components/mobile-nav';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';

export const dynamic = 'force-dynamic';

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
  const user = await d.authGateway.requireUser().catch((error) => {
    if (error instanceof ApplicationError && error.code === 'UNAUTHENTICATED') {
      return redirectFn('/sign-in');
    }
    throw error;
  });

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
    <AppShell authNav={authNav} mobileNav={mobileNav}>
      {children}
    </AppShell>
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
