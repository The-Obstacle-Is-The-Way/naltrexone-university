import Link from 'next/link';
import type { AuthUserButtonProps } from '@/components/auth-user-button';
import { AuthUserButton } from '@/components/auth-user-button';
import { Button } from '@/components/ui/button';
import type {
  AuthCheckDeps,
  AuthDepsContainer,
} from '@/lib/auth-deps-container';
import { getRequestAuthState } from '@/lib/auth-request-cache';
import type { LoadContainerFn } from '@/lib/controller-helpers';
import { ROUTES } from '@/lib/routes';

export type AuthNavDeps = AuthCheckDeps;
type UserButtonAppearance = NonNullable<AuthUserButtonProps['appearance']>;

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
  showPrimaryLink = true,
}: {
  deps?: AuthNavDeps;
  options?: { loadContainer?: LoadContainerFn<AuthDepsContainer> };
  showPrimaryLink?: boolean;
} = {}) {
  const skipClerk = process.env.NEXT_PUBLIC_SKIP_CLERK === 'true';

  const unauthenticatedNav = (
    <div className="flex items-center">
      <Button asChild className="rounded-full">
        <Link href={ROUTES.SIGN_IN}>Sign in</Link>
      </Button>
    </div>
  );

  if (skipClerk) {
    // CI fallback: render unauthenticated state
    return unauthenticatedNav;
  }

  const authState = await getRequestAuthState({ deps, options });

  if (!authState.user) {
    return unauthenticatedNav;
  }

  const primaryLink =
    authState.entitlement.isEntitled && showPrimaryLink
      ? { href: ROUTES.APP_DASHBOARD, label: 'Dashboard' }
      : null;
  const userButtonAppearance = {
    elements: {
      userButtonTrigger: 'min-h-[44px] min-w-[44px]',
    },
  } satisfies UserButtonAppearance;

  return (
    <div className="flex items-center space-x-4">
      {primaryLink ? (
        <Link
          href={primaryLink.href}
          className="rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground ring-focus"
        >
          {primaryLink.label}
        </Link>
      ) : null}
      <AuthUserButton appearance={userButtonAppearance} />
    </div>
  );
}
