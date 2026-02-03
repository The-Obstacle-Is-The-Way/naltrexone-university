'use server';

import type { AuthGateway } from '@/src/application/ports/gateways';
import type { CheckEntitlementUseCase } from '@/src/application/ports/use-cases';
import type { ActionResult } from './action-result';
import { err } from './action-result';

export type { CheckEntitlementUseCase } from '@/src/application/ports/use-cases';

export async function requireEntitledUserId(deps: {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
}): Promise<string | ActionResult<never>> {
  const user = await deps.authGateway.requireUser();
  const entitlement = await deps.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  if (!entitlement.isEntitled) {
    return err('UNSUBSCRIBED', 'Subscription required');
  }

  return user.id;
}
