import 'server-only';
import { cache } from 'react';
import type {
  AuthCheckDeps,
  AuthDepsContainer,
} from '@/lib/auth-deps-container';
import {
  createDepsResolver,
  type LoadContainerFn,
  loadAppContainer,
} from '@/lib/controller-helpers';
import type { CheckEntitlementOutput } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';

export type RequestAuthState =
  | {
      user: null;
      entitlement: null;
    }
  | {
      user: User;
      entitlement: CheckEntitlementOutput;
    };

type RequestAuthStateOptions = {
  loadContainer?: LoadContainerFn<AuthDepsContainer>;
};

const getAuthCheckDeps = createDepsResolver<AuthCheckDeps, AuthDepsContainer>(
  (container) => ({
    authGateway: container.createAuthGateway(),
    checkEntitlementUseCase: container.createCheckEntitlementUseCase(),
  }),
  loadAppContainer,
);

export async function loadRequestAuthState(
  deps: AuthCheckDeps,
): Promise<RequestAuthState> {
  const user = await deps.authGateway.getCurrentUser();
  if (!user) {
    return {
      user: null,
      entitlement: null,
    };
  }

  const entitlement = await deps.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  return { user, entitlement };
}

export function createCachedRequestAuthStateReader(
  loadDeps: () => Promise<AuthCheckDeps>,
) {
  return cache(async () => loadRequestAuthState(await loadDeps()));
}

const getCachedRequestAuthState = createCachedRequestAuthStateReader(() =>
  getAuthCheckDeps(),
);

export async function getRequestAuthState(input?: {
  deps?: AuthCheckDeps;
  options?: RequestAuthStateOptions;
}): Promise<RequestAuthState> {
  if (input?.deps) {
    return loadRequestAuthState(input.deps);
  }

  if (input?.options?.loadContainer) {
    const deps = await getAuthCheckDeps(undefined, input.options);
    return loadRequestAuthState(deps);
  }

  return getCachedRequestAuthState();
}
