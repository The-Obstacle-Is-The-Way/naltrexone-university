import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';

export type UseCase<Input, Output> = {
  execute: (input: Input) => Promise<Output>;
};

export type CheckEntitlementUseCase = UseCase<
  CheckEntitlementInput,
  CheckEntitlementOutput
>;
