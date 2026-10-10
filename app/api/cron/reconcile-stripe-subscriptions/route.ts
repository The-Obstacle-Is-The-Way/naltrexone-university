import { createContainer } from '@/lib/container';
import { limitStripeSubscriptionRequests } from '@/src/adapters/gateways/stripe/stripe-request-limits';
import { deleteStripeCustomer } from '@/src/adapters/gateways/stripe-customer-deleter';
import { drainPendingStripeCustomerCleanups } from '@/src/adapters/jobs/drain-pending-stripe-customer-cleanups';
import { reconcileAllStripeSubscriptionPages } from '@/src/adapters/jobs/reconcile-all-stripe-subscription-pages';
import { reconcileStripeSubscriptions } from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import type { ReconcileStripeSubscriptionsDeps } from '@/src/adapters/jobs/reconcile-stripe-subscriptions-types';
import { createReconcileStripeSubscriptionsCronRouteHandler } from './route-handler';

// Next.js requires route-segment configuration to be a statically analyzable literal.
export const maxDuration = 60;

// DEBT-501 item 1: each subscriptions request the job sends waits at most 5
// seconds for its socket to answer, and is tried once more after a failed
// connection, in place of the SDK's 80 seconds and two retries. Our retry
// wrapper can still repeat a 5xx or 429 call. The drain's customer deletes
// keep the SDK's defaults, and pages are checked against their 40-second
// budget only between pages.
const RECONCILE_STRIPE_REQUEST_LIMITS = {
  timeoutMs: 5_000,
  maxNetworkRetries: 1,
};

type CronContainerResolver = () => ReturnType<typeof createContainer>;

/**
 * Composition root: wires the container's Stripe client, database and
 * repositories into the reconciliation and drain jobs, then hands the narrow
 * dependency seam to the route handler. Wiring is covered by
 * `tests/integration/cron-routes.integration.test.ts` against real Postgres.
 */
export function createReconcileStripeSubscriptionsCronHandler(
  resolveContainer: CronContainerResolver = createContainer,
) {
  return createReconcileStripeSubscriptionsCronRouteHandler(() => {
    const container = resolveContainer();
    const reconciliationDeps: ReconcileStripeSubscriptionsDeps = {
      stripe: limitStripeSubscriptionRequests(
        container.stripe,
        RECONCILE_STRIPE_REQUEST_LIMITS,
      ),
      priceIds: {
        monthly: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
        annual: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
      },
      logger: container.logger,
      now: container.now,
      webhookE2EOwner: container.env.STRIPE_WEBHOOK_E2E_OWNER,
      listLocalSubscriptions: async ({ limit, offset }) => {
        const rows = await container.db.query.stripeSubscriptions.findMany({
          columns: {
            userId: true,
            stripeSubscriptionId: true,
            version: true,
          },
          orderBy: (subs, { asc }) => [asc(subs.userId)],
          limit,
          offset,
        });

        return rows.map((row) => ({
          userId: row.userId,
          stripeSubscriptionId: row.stripeSubscriptionId,
          version: row.version,
        }));
      },
      transaction: async (fn) =>
        container.db.transaction(async (tx) =>
          fn({
            stripeCustomers: container.createStripeCustomerRepository(tx),
            subscriptions: container.createSubscriptionRepository(tx),
            renewalConsentRecords:
              container.createRenewalConsentRecordRepository(tx),
          }),
        ),
    };
    const reconcilePage = (
      input: Parameters<typeof reconcileStripeSubscriptions>[0],
    ) => reconcileStripeSubscriptions(input, reconciliationDeps);

    return {
      cronSecret: container.env.CRON_SECRET,
      logger: container.logger,
      operationalAlerts: container.createOperationalAlerts(),
      createRateLimiter: container.createRateLimiter,
      reconcilePage,
      reconcileAllPages: (input) =>
        reconcileAllStripeSubscriptionPages(input, {
          reconcilePage,
          logger: container.logger,
          now: Date.now,
        }),
      drainPendingStripeCustomerCleanups: (input) =>
        drainPendingStripeCustomerCleanups(input, {
          pendingStripeCustomerCleanups:
            container.createPendingStripeCustomerCleanupRepository(),
          completePendingStripeCustomerCleanup: (eventId) =>
            container.db.transaction(async (tx) => {
              await container
                .createPendingStripeCustomerCleanupRepository(tx)
                .deleteByEventId(eventId);
              await container
                .createClerkEventRepository(tx)
                .markProcessed(eventId);
            }),
          deleteStripeCustomer: (stripeCustomerId) =>
            deleteStripeCustomer(
              container.stripe,
              container.logger,
              stripeCustomerId,
            ),
          logger: container.logger,
        }),
    };
  });
}

const handleCronRequest = createReconcileStripeSubscriptionsCronHandler();

export async function GET(req: Request) {
  return handleCronRequest(req);
}

export async function POST(req: Request) {
  return handleCronRequest(req);
}
