import type { AuthGateway } from '@/src/application/ports/gateways';
import type { CheckEntitlementUseCase } from '@/src/application/ports/use-cases';

export type AuthCheckDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
};

export type AuthDepsContainer = {
  createAuthGateway: () => AuthGateway;
  createCheckEntitlementUseCase: () => CheckEntitlementUseCase;
};
