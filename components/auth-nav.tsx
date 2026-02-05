import Link from 'next/link';
import type {
  AuthCheckDeps,
  AuthDepsContainer,
} from '@/lib/auth-deps-container';
import {
  createDepsResolver,
  type LoadContainerFn,
  loadAppContainer,
} from '@/lib/controller-helpers';

export type AuthNavDeps = AuthCheckDeps;

const getDeps = createDepsResolver<AuthNavDeps, AuthDepsContainer>(
  (container) => ({
    authGateway: container.createAuthGateway(),
    checkEntitlementUseCase: container.createCheckEntitlementUseCase(),
  }),
  loadAppContainer,
);

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
  options,
}: {
  deps?: AuthNavDeps;
  options?: { loadContainer?: LoadContainerFn<AuthDepsContainer> };
} = {}) {
  const skipClerk = process.env.NEXT_PUBLIC_SKIP_CLERK === 'true';

  const unauthenticatedNav = (
    <div className="flex items-center space-x-4">
      <Link
        href="/pricing"
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Pricing
      </Link>
      <Link
        href="/sign-in"
        className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Sign In
      </Link>
    </div>
  );

  if (skipClerk) {
    // CI fallback: render unauthenticated state
    return unauthenticatedNav;
  }

  const d = await getDeps(deps, options);
  const user = await d.authGateway.getCurrentUser();

  if (!user) {
    return unauthenticatedNav;
  }

  const entitlement = await d.checkEntitlementUseCase.execute({
    userId: user.id,
  });
  const primaryLink = entitlement.isEntitled
    ? { href: '/app/dashboard', label: 'Dashboard' }
    : { href: '/pricing', label: 'Pricing' };

  const { UserButton } = await import('@clerk/nextjs');

  return (
    <div className="flex items-center space-x-4">
      <Link
        href={primaryLink.href}
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {primaryLink.label}
      </Link>
      <UserButton />
    </div>
  );
}
