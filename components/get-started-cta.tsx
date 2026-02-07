import 'server-only';
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
import { ROUTES } from '@/lib/routes';

export type GetStartedCtaDeps = AuthCheckDeps;
const ctaClassName =
  'inline-block rounded-full bg-primary px-8 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors';

const getDeps = createDepsResolver<GetStartedCtaDeps, AuthDepsContainer>(
  (container) => ({
    authGateway: container.createAuthGateway(),
    checkEntitlementUseCase: container.createCheckEntitlementUseCase(),
  }),
  loadAppContainer,
);

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
      <Link href={ROUTES.PRICING} className={ctaClassName}>
        Get Started
      </Link>
    );
  }

  const d = await getDeps(deps, options);
  const user = await d.authGateway.getCurrentUser();
  if (!user) {
    return (
      <Link href={ROUTES.PRICING} className={ctaClassName}>
        Get Started
      </Link>
    );
  }

  const entitlement = await d.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  const href = entitlement.isEntitled ? ROUTES.APP_DASHBOARD : ROUTES.PRICING;
  const label = entitlement.isEntitled ? 'Go to Dashboard' : 'Get Started';

  return (
    <Link href={href} className={ctaClassName}>
      {label}
    </Link>
  );
}
