import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';

type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

export type AuthNavDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
};

type ContainerLike = {
  createAuthGateway: () => AuthGateway;
  createCheckEntitlementUseCase: () => CheckEntitlementUseCase;
};

async function getDeps(
  deps?: AuthNavDeps,
  createContainerFn?: () => ContainerLike,
): Promise<AuthNavDeps> {
  if (deps) return deps;

  if (createContainerFn) {
    const container = createContainerFn();
    return {
      authGateway: container.createAuthGateway(),
      checkEntitlementUseCase: container.createCheckEntitlementUseCase(),
    };
  }

  const { createContainer } = await import('@/lib/container');
  const container = createContainer();

  return {
    authGateway: container.createAuthGateway(),
    checkEntitlementUseCase: container.createCheckEntitlementUseCase(),
  };
}

/**
 * Auth-aware navigation component.
 *
 * In CI environments with NEXT_PUBLIC_SKIP_CLERK=true, renders an unauthenticated
 * fallback UI. This allows static page generation without valid Clerk credentials.
 *
 * In production/development with real Clerk keys, renders the full auth UI.
 */
export async function AuthNav({
  deps,
  createContainerFn,
}: {
  deps?: AuthNavDeps;
  createContainerFn?: () => ContainerLike;
} = {}) {
  const skipClerk = process.env.NEXT_PUBLIC_SKIP_CLERK === 'true';

  if (skipClerk) {
    // CI fallback: render unauthenticated state
    return (
      <div className="flex items-center space-x-4">
        <Link
          href="/pricing"
          className="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Pricing
        </Link>
        <Link
          href="/sign-in"
          className="rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const d = await getDeps(deps, createContainerFn);
  const user = await d.authGateway.getCurrentUser();

  if (!user) {
    return (
      <div className="flex items-center space-x-4">
        <Link
          href="/pricing"
          className="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Pricing
        </Link>
        <Link
          href="/sign-in"
          className="rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const entitlement = await d.checkEntitlementUseCase.execute({
    userId: user.id,
  });
  const primaryLink = entitlement.isEntitled
    ? { href: '/app/dashboard', label: 'Dashboard' }
    : { href: '/pricing', label: 'Pricing' };

  return (
    <div className="flex items-center space-x-4">
      <Link
        href={primaryLink.href}
        className="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {primaryLink.label}
      </Link>
      <UserButton />
    </div>
  );
}
