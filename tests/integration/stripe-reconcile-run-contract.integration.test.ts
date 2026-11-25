import { afterAll, afterEach } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleStripeReconcileRunRepository } from '@/src/adapters/repositories/drizzle-stripe-reconcile-run-repository';
import { runStripeReconcileRunContract } from '../shared/stripe-reconcile-run-contract';
import { closeConnection, createIntegrationDb } from './helpers';

const { db, sql } = createIntegrationDb();

// DEBT-501 item 9: the table holds only the scheduled reconcile's runs, and
// integration files run one at a time (`fileParallelism: false`), so each
// scenario starts from an empty table and leaves none behind.
const emptyRuns = () => db.delete(schema.stripeReconcileRuns);

afterEach(emptyRuns);

afterAll(async () => {
  await closeConnection(sql);
});

runStripeReconcileRunContract(
  'DrizzleStripeReconcileRunRepository',
  async () => {
    await emptyRuns();
    return { repository: new DrizzleStripeReconcileRunRepository(db) };
  },
);
