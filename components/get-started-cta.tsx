import 'server-only';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type {
  AuthCheckDeps,
  AuthDepsContainer,
} from '@/lib/auth-deps-container';
import { getRequestAuthState } from '@/lib/auth-request-cache';
import type { LoadContainerFn } from '@/lib/controller-helpers';
import { ROUTES } from '@/lib/routes';

export type GetStartedCtaDeps = AuthCheckDeps;
const ctaClassName = 'rounded-full px-8 py-3 text-base';

export async function GetStartedCta({
  deps,
  options,
}: {
  deps?: GetStartedCtaDeps;
  options?: { loadContainer?: LoadContainerFn<AuthDepsContainer> };
} = {}) {
  const skipClerk = process.env.NEXT_PUBLIC_SKIP_CLERK === 'true';
  if (skipClerk) {
    return (
      <Button asChild className={ctaClassName}>
        <Link href={ROUTES.PRICING}>Get Started</Link>
      </Button>
    );
  }

  const { user, entitlement } = await getRequestAuthState({ deps, options });
  if (!user) {
    return (
      <Button asChild className={ctaClassName}>
        <Link href={ROUTES.PRICING}>Get Started</Link>
      </Button>
    );
  }

  const href = entitlement.isEntitled ? ROUTES.APP_DASHBOARD : ROUTES.PRICING;
  const label = entitlement.isEntitled ? 'Go to Dashboard' : 'Get Started';

  return (
    <Button asChild className={ctaClassName}>
      <Link href={href}>{label}</Link>
    </Button>
  );
}
