import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import type {
  CheckTrialSavedCardInput,
  CheckTrialSavedCardOutput,
} from '@/src/application/use-cases/check-trial-saved-card';

export type UseCase<Input, Output> = {
  execute: (input: Input) => Promise<Output>;
};

export type CheckEntitlementUseCase = UseCase<
  CheckEntitlementInput,
  CheckEntitlementOutput
>;

export type CheckTrialSavedCardUseCase = UseCase<
  CheckTrialSavedCardInput,
  CheckTrialSavedCardOutput
>;
