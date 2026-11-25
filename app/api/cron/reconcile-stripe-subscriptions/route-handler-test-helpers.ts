import type { ClerkBackendCallUsageOutcome } from '@/src/adapters/jobs/clerk-backend-call-usage';
import type { DrainPendingStripeCustomerCleanupsOutput } from '@/src/adapters/jobs/drain-pending-stripe-customer-cleanups';
import type {
  ReconcileAllStripeSubscriptionPagesInput,
  ReconcileAllStripeSubscriptionPagesOutput,
} from '@/src/adapters/jobs/reconcile-all-stripe-subscription-pages';
import type {
  ReconcileStripeSubscriptionsInput,
  ReconcileStripeSubscriptionsOutput,
} from '@/src/adapters/jobs/reconcile-stripe-subscriptions-types';
import {
  FakeLogger,
  FakeOperationalAlerts,
  FakeRateLimiter,
  FakeStripeReconcileRunRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createReconcileStripeSubscriptionsCronRouteHandler,
  type DrainPendingStripeCustomerCleanupsRequest,
  type ReconcileStripeSubscriptionsCronHandlerDependencies,
} from './route-handler';

// The reconcile cron route's test harness, shared by its suites.
export const ROUTE_URL =
  'http://localhost/api/cron/reconcile-stripe-subscriptions';
export const ROUTE = '/api/cron/reconcile-stripe-subscriptions';
export const NOW = new Date('2026-11-25T08:15:00.000Z');
// Past the route's 60 seconds, as the next day's watch reads the runs.
export const WATCH_TIME = new Date('2026-11-25T09:15:00.000Z');

export const pageResult: ReconcileStripeSubscriptionsOutput = {
  scanned: 0,
  updated: 0,
  failed: 0,
  failures: [],
};

export const allPagesResult: ReconcileAllStripeSubscriptionPagesOutput = {
  ...pageResult,
  pagesScanned: 1,
  stoppedEarly: false,
  nextOffset: null,
};

export const drainResult: DrainPendingStripeCustomerCleanupsOutput = {
  scanned: 0,
  drained: 0,
  failed: 0,
  failures: [],
  hasMore: false,
  dryRun: true,
};

export function createHarness(input?: {
  omitCronSecret?: boolean;
  cronSecret?: string;
  rateLimiter?: FakeRateLimiter;
  pageResult?: ReconcileStripeSubscriptionsOutput;
  pageError?: Error;
  allPagesResult?: ReconcileAllStripeSubscriptionPagesOutput;
  allPagesError?: Error;
  drainResult?: DrainPendingStripeCustomerCleanupsOutput;
  drainError?: Error;
  clerkBackendCallUsage?: ClerkBackendCallUsageOutcome;
  reconcileRuns?: FakeStripeReconcileRunRepository;
}) {
  const logger = new FakeLogger();
  const reconcileRuns =
    input?.reconcileRuns ?? new FakeStripeReconcileRunRepository();
  const rateLimiter = input?.rateLimiter ?? new FakeRateLimiter();
  const pageCalls: ReconcileStripeSubscriptionsInput[] = [];
  const allPagesCalls: ReconcileAllStripeSubscriptionPagesInput[] = [];
  const drainCalls: DrainPendingStripeCustomerCleanupsRequest[] = [];
  let rollUps = 0;
  const alerts = new FakeOperationalAlerts();
  const dependencies: ReconcileStripeSubscriptionsCronHandlerDependencies = {
    cronSecret: input?.omitCronSecret
      ? undefined
      : (input?.cronSecret ?? 'test-secret'),
    logger,
    createRateLimiter: () => rateLimiter,
    reconcilePage: async (pageInput) => {
      pageCalls.push(pageInput);
      if (input?.pageError) throw input.pageError;
      return input?.pageResult ?? pageResult;
    },
    reconcileAllPages: async (allPagesInput) => {
      allPagesCalls.push(allPagesInput);
      if (input?.allPagesError) throw input.allPagesError;
      return input?.allPagesResult ?? allPagesResult;
    },
    drainPendingStripeCustomerCleanups: async (drainInput) => {
      drainCalls.push(drainInput);
      if (input?.drainError) throw input.drainError;
      return input?.drainResult ?? drainResult;
    },
    operationalAlerts: alerts,
    rollUpClerkBackendCallUsage: async () => {
      rollUps += 1;
      return input?.clerkBackendCallUsage ?? 'up_to_date';
    },
    reconcileRuns,
    now: () => NOW,
  };
  return {
    handle: createReconcileStripeSubscriptionsCronRouteHandler(
      () => dependencies,
    ),
    logger,
    rateLimiter,
    pageCalls,
    allPagesCalls,
    drainCalls,
    alerts,
    rollUps: () => rollUps,
    reconcileRuns,
  };
}

export function request(input?: {
  query?: string;
  method?: 'GET' | 'POST';
  authorization?: string | null;
}): Request {
  const headers: Record<string, string> = {};
  const authorization =
    input?.authorization === undefined
      ? 'Bearer test-secret'
      : input.authorization;
  if (authorization !== null) headers.authorization = authorization;
  return new Request(`${ROUTE_URL}${input?.query ?? ''}`, {
    method: input?.method ?? 'POST',
    headers,
  });
}
