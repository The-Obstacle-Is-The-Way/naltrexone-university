import Link from 'next/link';
import type {
  AuthDepsContainer,
  CheckEntitlementUseCase,
} from '@/lib/auth-deps-container';
import {
  createDepsResolver,
  type LoadContainerFn,
  loadAppContainer,
} from '@/lib/controller-helpers';
import type { AuthGateway } from '@/src/application/ports/gateways';

export type GetStartedCtaDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
};

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
      <Link
        href="/pricing"
        className="inline-block rounded-full bg-orange-600 px-8 py-3 text-base font-medium text-white hover:bg-orange-700"
      >
        Get Started
      </Link>
    );
  }

  const d = await getDeps(deps, options);
  const user = await d.authGateway.getCurrentUser();
  if (!user) {
    return (
      <Link
        href="/pricing"
        className="inline-block rounded-full bg-orange-600 px-8 py-3 text-base font-medium text-white hover:bg-orange-700"
      >
        Get Started
      </Link>
    );
  }

  const entitlement = await d.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  const href = entitlement.isEntitled ? '/app/dashboard' : '/pricing';
  const label = entitlement.isEntitled ? 'Go to Dashboard' : 'Get Started';

  return (
    <Link
      href={href}
      className="inline-block rounded-full bg-orange-600 px-8 py-3 text-base font-medium text-white hover:bg-orange-700"
    >
      {label}
    </Link>
  );
}
