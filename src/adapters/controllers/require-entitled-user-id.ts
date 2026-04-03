'use server';

import { getRequestAuthState } from '@/lib/auth-request-cache';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { CheckEntitlementUseCase } from '@/src/application/ports/use-cases';

export type { CheckEntitlementUseCase } from '@/src/application/ports/use-cases';

export async function requireEntitledUserId(deps: {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
}): Promise<string> {
  const { user, entitlement } = await getRequestAuthState({ deps });

  if (!user) {
    throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
  }

  if (!entitlement.isEntitled) {
    throw new ApplicationError('UNSUBSCRIBED', 'Subscription required');
  }

  return user.id;
}
