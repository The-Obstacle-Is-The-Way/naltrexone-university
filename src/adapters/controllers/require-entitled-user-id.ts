// A helper for server actions, not one itself: a 'use server' module would make
// it callable by a client with arguments of its choosing.
import 'server-only';

import { getRequestAuthState } from '@/lib/auth-request-cache';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { CheckEntitlementUseCase } from '@/src/application/ports/use-cases';
import type { DepsResolutionSource } from './create-action';

export type { CheckEntitlementUseCase } from '@/src/application/ports/use-cases';

export async function requireEntitledUserId(
  deps: {
    authGateway: AuthGateway;
    checkEntitlementUseCase: CheckEntitlementUseCase;
  },
  options?: {
    depsSource?: DepsResolutionSource;
  },
): Promise<string> {
  const authState =
    options?.depsSource === 'default_container'
      ? await getRequestAuthState()
      : await getRequestAuthState({ deps });

  if (!authState.user) {
    throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
  }

  if (!authState.entitlement.isEntitled) {
    throw new ApplicationError('UNSUBSCRIBED', 'Subscription required');
  }

  return authState.user.id;
}
