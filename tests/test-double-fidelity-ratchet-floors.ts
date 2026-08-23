// DEBT-472 Part A baseline measured at dev 01fd55b8 on 2026-08-23.
// These are growth-only per-file floors, not zero-violation allowlists. Later
// migration parts may lower or remove entries; no unrelated change may raise
// them or add a new file. The raw unknown-double-cast census is 325 sites in
// 60 files. Six documented allowlist categories exclude 36 shape-only or
// intentional-invalid sites, leaving 289 enforced sites in 50 files. The
// other baselines are 22 own-code module factories in 13 files (17 vi.mock
// sites plus 5 vi.doMock sites) and 45 hand-rolled maintained-port doubles in
// 18 files.

export const OWN_CODE_MODULE_MOCK_FLOORS = new Map<string, number>([
  ['app/(app)/app/history/components/history-sessions-tab.test.tsx', 1],
  ['app/(app)/app/layout-shell.test.tsx', 1],
  [
    'app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.test.tsx',
    1,
  ],
  ['app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts', 1],
  ['app/(app)/app/practice/fire-and-forget.test.ts', 1],
  ['app/(app)/app/practice/practice-page-client.test.tsx', 2],
  ['app/(app)/app/practice/practice-page-incomplete-session.test.ts', 1],
  ['app/(app)/app/practice/quick/quick-practice-client.test.tsx', 1],
  ['app/(app)/app/questions/[slug]/question-page-logic.test.ts', 1],
  ['app/api/cron/reconcile-stripe-subscriptions/route.test.ts', 4],
  ['app/layout.test.tsx', 2],
  ['components/auth-nav.test.tsx', 5],
  ['components/marketing/marketing-layout.test.tsx', 1],
]);

export const UNKNOWN_DOUBLE_CAST_FLOORS = new Map<string, number>([
  ['app/(app)/app/billing/page.test.tsx', 1],
  ['app/(app)/app/practice/[sessionId]/page.test.tsx', 1],
  ['app/(app)/app/questions/[slug]/page.test.tsx', 1],
  ['app/api/stripe/webhook/route.test.ts', 2],
  ['app/pricing/page.test.tsx', 1],
  ['db/schema.test.ts', 3],
  ['lib/container.skip-clerk.test.ts', 6],
  ['lib/container.test.ts', 15],
  ['proxy.test.ts', 28],
  ['scripts/export-question-feedback.test.ts', 1],
  ['src/adapters/controllers/controller-output-datetime-contract.test.ts', 2],
  ['src/adapters/gateways/drizzle-rate-limiter.test.ts', 12],
  [
    'src/adapters/gateways/stripe/stripe-checkout-sessions-concurrency.test.ts',
    1,
  ],
  [
    'src/adapters/gateways/stripe/stripe-checkout-sessions-live-retrieve.test.ts',
    1,
  ],
  [
    'src/adapters/gateways/stripe/stripe-checkout-sessions-reconciliation.test.ts',
    1,
  ],
  ['src/adapters/gateways/stripe/stripe-checkout-sessions-recovery.test.ts', 1],
  [
    'src/adapters/gateways/stripe/stripe-checkout-sessions-trial-recovery.test.ts',
    1,
  ],
  ['src/adapters/gateways/stripe/stripe-checkout-sessions-trials.test.ts', 2],
  ['src/adapters/gateways/stripe/stripe-checkout-sessions.test.ts', 2],
  ['src/adapters/gateways/stripe/stripe-customers.test.ts', 7],
  ['src/adapters/gateways/stripe/stripe-portal.test.ts', 2],
  ['src/adapters/gateways/stripe/stripe-subscription-normalizer.test.ts', 3],
  ['src/adapters/gateways/stripe/stripe-webhook-processor.test.ts', 1],
  ['src/adapters/repositories/drizzle-attempt-repository.test.ts', 33],
  ['src/adapters/repositories/drizzle-bookmark-repository.test.ts', 9],
  ['src/adapters/repositories/drizzle-clerk-event-repository.test.ts', 6],
  [
    'src/adapters/repositories/drizzle-deleted-clerk-user-repository.test.ts',
    5,
  ],
  ['src/adapters/repositories/drizzle-idempotency-key-repository.test.ts', 19],
  [
    'src/adapters/repositories/drizzle-pending-stripe-customer-cleanup-repository.test.ts',
    6,
  ],
  [
    'src/adapters/repositories/drizzle-practice-session-repository-corrupt-list-reads.test.ts',
    1,
  ],
  [
    'src/adapters/repositories/drizzle-practice-session-repository-history-summary.test.ts',
    1,
  ],
  [
    'src/adapters/repositories/drizzle-practice-session-repository-question-state-missing-row.test.ts',
    1,
  ],
  [
    'src/adapters/repositories/drizzle-practice-session-repository-question-state.test.ts',
    14,
  ],
  [
    'src/adapters/repositories/drizzle-practice-session-repository-reads.test.ts',
    4,
  ],
  [
    'src/adapters/repositories/drizzle-practice-session-repository-session-writes.test.ts',
    13,
  ],
  [
    'src/adapters/repositories/drizzle-practice-session-repository-statement-cancellation.test.ts',
    1,
  ],
  ['src/adapters/repositories/drizzle-question-feedback-repository.test.ts', 6],
  ['src/adapters/repositories/drizzle-question-repository.test.ts', 16],
  [
    'src/adapters/repositories/drizzle-renewal-consent-record-repository.test.ts',
    5,
  ],
  ['src/adapters/repositories/drizzle-stripe-customer-repository.test.ts', 8],
  ['src/adapters/repositories/drizzle-stripe-event-repository.test.ts', 16],
  ['src/adapters/repositories/drizzle-subscription-repository.test.ts', 1],
  ['src/adapters/repositories/drizzle-tag-repository.test.ts', 1],
  [
    'src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository.test.ts',
    1,
  ],
  ['src/adapters/repositories/drizzle-user-repository.test.ts', 20],
  [
    'src/adapters/repositories/practice-session-question-state-updater-lock.test.ts',
    1,
  ],
  [
    'src/application/test-helpers/fakes/fake-practice-session-repository.test.ts',
    1,
  ],
  ['tests/e2e/helpers/bookmark.test.ts', 2],
  [
    'tests/integration/bug-regression-practice-session-transaction-isolation.integration.test.ts',
    2,
  ],
  ['tests/integration/controllers.integration.test.ts', 1],
]);

export const HAND_ROLLED_PORT_DOUBLE_FLOORS = new Map<string, number>([
  ['app/(app)/app/layout.test.ts', 6],
  ['app/api/stripe/webhook/route.test.ts', 7],
  ['app/api/webhooks/clerk/route.test.ts', 2],
  ['app/pricing/page.test.tsx', 6],
  ['lib/container.test.ts', 1],
  ['lib/logger.test.ts', 1],
  ['src/adapters/controllers/question-view-controller.test.ts', 1],
  [
    'src/adapters/controllers/stripe-webhook-controller-renewal-acknowledgment.test.ts',
    2,
  ],
  ['src/adapters/gateways/stripe-payment-gateway.test.ts', 8],
  [
    'src/adapters/gateways/stripe/stripe-webhook-processor-setup-expiration.test.ts',
    1,
  ],
  ['src/adapters/gateways/stripe/stripe-webhook-processor.test.ts', 1],
  ['src/adapters/jobs/reconcile-stripe-subscriptions.test.ts', 1],
  ['src/adapters/jobs/reconcile-stripe-subscriptions-version-fence.test.ts', 1],
  [
    'src/adapters/repositories/drizzle-practice-session-repository-corrupt-list-reads.test.ts',
    1,
  ],
  ['tests/integration/actions.stripe.integration.test.ts', 3],
  [
    'tests/integration/bug-regression-subscription-observation-version-fence.integration.test.ts',
    1,
  ],
  ['tests/integration/renewal-consent-records.integration.test.ts', 1],
  [
    'tests/integration/stripe-subscription-writer-lock-order.integration.test.ts',
    1,
  ],
]);
