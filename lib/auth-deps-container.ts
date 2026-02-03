import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';

export type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

export type AuthDepsContainer = {
  createAuthGateway: () => AuthGateway;
  createCheckEntitlementUseCase: () => CheckEntitlementUseCase;
};
