import Link from 'next/link';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';

type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

export type GetStartedCtaDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
};

async function getDeps(deps?: GetStartedCtaDeps): Promise<GetStartedCtaDeps> {
  if (deps) return deps;

  const { createContainer } = await import('@/lib/container');
  const container = createContainer();

  return {
    authGateway: container.createAuthGateway(),
    checkEntitlementUseCase: container.createCheckEntitlementUseCase(),
  };
}

export async function GetStartedCta({ deps }: { deps?: GetStartedCtaDeps }) {
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

  const d = await getDeps(deps);
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
