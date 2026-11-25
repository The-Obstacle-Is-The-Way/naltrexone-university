import { runStripeReconcileRunContract } from '@/tests/shared/stripe-reconcile-run-contract';
import { FakeStripeReconcileRunRepository } from './fake-stripe-reconcile-run-repository';

runStripeReconcileRunContract('FakeStripeReconcileRunRepository', async () => ({
  repository: new FakeStripeReconcileRunRepository(),
}));
