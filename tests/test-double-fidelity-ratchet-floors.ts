// DEBT-472 Part A baseline measured at dev 01fd55b8 on 2026-08-23.
// These are growth-only per-file floors, not zero-violation allowlists. Later
// migration parts may lower or remove entries; no unrelated change may raise
// them or add a new file. The raw unknown-double-cast census is 325 sites in
// 60 files. Six documented allowlist categories exclude 36 shape-only or
// intentional-invalid sites, leaving 289 enforced sites in 50 files. The
// other baselines are 22 own-code module factories in 13 files (17 vi.mock
// sites plus 5 vi.doMock sites) and 45 hand-rolled maintained-port doubles in
// 18 files.
// 2026-09-19: Stripe-event repository integration replacements retire all 16
// casts in its unit suite: enforced casts are now 273 sites across 49 files.
// 2026-09-19: Attempt behavior moves to Postgres and five retained error units
// use typed prepared-query faults: 33 more casts retire, leaving 240 / 48 files.
// 2026-09-23 UTC: Rate-limiter Postgres replacements retire 12 more casts,
// leaving 228 enforced sites across 47 files.
// 2026-09-23 UTC: Portal tests reuse the typed client, retiring two casts:
// 226 enforced sites across 46 files. No client behavior or waiver changes.
// 2026-09-23 UTC: Real feedback-export SQL coverage retires its cast:
// 225 enforced sites across 45 files.
// 2026-09-23 UTC: The lost-session fixture uses public discard, not private
// state access: 224 enforced sites across 44 files.
// 2026-09-23 UTC: The transactional controller fault uses a real subclass,
// not a prototype-dropping cast: 223 enforced sites across 43 files.
// 2026-09-23 UTC: Observable container wiring replaces private-field checks:
// 216 enforced sites across 43 files. No SDK/fake behavior changes.
// 2026-09-23 UTC: Real container transaction coverage retires two more casts
// and its canned payment gateway: 214 casts / 43 files, 44 port doubles / 17.
// 2026-09-23 UTC: Four customer fault/request-shape cases reuse the typed
// maintained client: 210 casts / 43 files. Three Search behavior cases remain.
// 2026-09-23 UTC: Four logic suites exercise the real client reporter and
// fake only Sentry: 18 own-code module factories remain across nine files.
// 2026-09-23 UTC: Mark-for-review async cases move to real browser state
// and the real reporter: 17 own-code module factories across eight files.
// 2026-09-23 UTC: History disclosure behavior uses the real hook in Browser
// Mode, leaving 16 own-code module factories across seven files.
// 2026-09-23 UTC: Quick Practice count rendering uses its real hook,
// leaving 15 own-code module factories across six files.
// 2026-09-23 UTC: Practice starter state uses the real hook and component,
// leaving 13 own-code module factories across five files.
// 2026-09-23 UTC: Root-layout tests execute both actual provider wrappers,
// leaving 11 own-code module factories across four files.
// 2026-09-23 UTC: AuthNav tests execute the actual AuthUserButton wrapper and
// observe Clerk's dynamic-import boundary, leaving 6 own-code module
// factories across three files.

export const OWN_CODE_MODULE_MOCK_FLOORS = new Map<string, number>([
  ['app/(app)/app/layout-shell.test.tsx', 1],
  ['app/api/cron/reconcile-stripe-subscriptions/route.test.ts', 4],
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
  ['lib/container.test.ts', 6],
  ['proxy.test.ts', 28],
  ['src/adapters/controllers/controller-output-datetime-contract.test.ts', 2],
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
  ['src/adapters/gateways/stripe/stripe-customers.test.ts', 3],
  ['src/adapters/gateways/stripe/stripe-subscription-normalizer.test.ts', 3],
  ['src/adapters/gateways/stripe/stripe-webhook-processor.test.ts', 1],
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
  ['tests/e2e/helpers/bookmark.test.ts', 2],
  [
    'tests/integration/bug-regression-practice-session-transaction-isolation.integration.test.ts',
    2,
  ],
]);

export const HAND_ROLLED_PORT_DOUBLE_FLOORS = new Map<string, number>([
  ['app/(app)/app/layout.test.ts', 6],
  ['app/api/stripe/webhook/route.test.ts', 7],
  ['app/api/webhooks/clerk/route.test.ts', 2],
  ['app/pricing/page.test.tsx', 6],
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
