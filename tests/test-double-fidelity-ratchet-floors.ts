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
// 2026-09-23 UTC: The DEBT-421 toggle sentinels moved to Browser Mode twins
// that watch for the real control, leaving 4 own-code module factories in one
// file.
// 2026-09-23 UTC: The reconcile cron route composes a narrow handler seam, so
// its orchestration tests use typed fakes; no own-code module factories
// remain.

// 2026-09-25 UTC: The DEBT-469 pricing split moves the three loadPricingData
// AuthGateway literals into page-actions.test.tsx with their cases, so the
// pricing floor follows them (6 → 3 + 3). The sites and the total are
// unchanged; retiring them is left to a behavior-reviewed change, because
// their throwing requireUser also asserts that the loader never calls it.
export const OWN_CODE_MODULE_MOCK_FLOORS = new Map<string, number>([]);

// 2026-09-23 UTC: The user-repository unit suite keeps seven typed
// error-translation cases at the real prepared-query boundary and moves its
// behavior to real Postgres, retiring its 20 casts.
// 2026-09-23 UTC: The idempotency-key unit suite retires entirely (19 casts);
// its behavior cases and its no-query limit guard run against real Postgres in
// tests/integration/idempotency-key-repository-guards.integration.test.ts.
// 2026-09-23 UTC: The bookmark unit suite keeps one impossible-driver-response
// case and moves membership, upsert, removal and ordering to real Postgres.
// 2026-09-23 UTC: The question-repository unit suite retires entirely (16 casts);
// its lookups, ordering, predicates and mapping run against real Postgres, and
// its four no-query input guards run with a boundary spy in
// tests/integration/question-repository-lookups.integration.test.ts.
// 2026-09-23 UTC: The Stripe-customer unit suite keeps two impossible-response
// cases and moves lookup, upsert and conflict behavior to real Postgres.
// 2026-09-23 UTC: The Clerk event and tombstone unit suites retire entirely;
// every case has a real-Postgres twin and no error translation remained.
// 2026-09-23 UTC: The question-feedback unit suite keeps two impossible-response
// cases; the renewal-consent and pending-cleanup suites retire entirely (their
// prune guard and contract twin run on real Postgres in tests/integration).
// 2026-09-24 UTC: The practice-session question-state, missing-row and
// updater-lock unit suites retire entirely behind
// tests/integration/practice-session-question-state-writes.integration.test.ts
// and the lock-granularity suite; the statement-cancellation suite keeps its
// two 57014 cases on drizzle.mock at the real prepared-query boundary.
// 2026-09-24 UTC: The practice-session session-writes unit suite keeps two
// impossible-driver-response cases on drizzle.mock; the create guard, discard
// scoping and end() behavior run on real Postgres in
// tests/integration/practice-session-writes.integration.test.ts.
// 2026-09-24 UTC: The practice-session reads and history-summary unit suites
// retire entirely behind tests/integration/practice-session-reads.integration.test.ts;
// the corrupt-list-reads suite keeps one driver-failure case on drizzle.mock.
// 2026-09-25 UTC: The payment-gateway suite moves onto the fake: its webhook
// and Checkout sections retire behind adapter twins, and its payment-method
// cases use the fake's PaymentMethods and Subscription update (contracted
// against Stripe TEST mode); its eight hand-built StripeClient literals retire.
// 2026-09-25 UTC: The setup-expiration webhook suite moves onto the fake with
// an injected event; its typed StripeClient literal (the hand-rolled port
// double, whose Subscription retrieve answered {}) retires.
// 2026-09-25 UTC: The customer suite's three Search cases move onto the fake,
// which now models metadata Search (contracted against Stripe TEST mode); its
// three casts retire.
// 2026-09-25 UTC: The schema suite reads indexes and checks through Drizzle's
// public getTableConfig/PgDialect instead of casting tables to reach private
// symbols; its three casts retire.
// 2026-09-25 UTC: The proxy suite passes real NextRequest/NextFetchEvent objects
// instead of 28 empty objects cast to them, and splits by concern.
// 2026-09-25 UTC: The reconcile suite moves onto the fake (Subscription retrieve
// override and cancel hook) and splits by concern; its stub-returning helper
// (the hand-rolled port double) retires.
// 2026-09-25 UTC: The reconcile version-fence suite moves onto the fake, which
// now models Subscription cancel (contracted against Stripe TEST mode); its
// hand-built StripeClient literal (the hand-rolled port double) retires.
// 2026-09-24 UTC: The webhook-processor suite moves onto the fake with an injected
// event, seeded SetupIntents and seeded Subscriptions; its signature-failure
// cast and its typed StripeClient literal (the hand-rolled port double) retire.
// 2026-09-24 UTC: The concurrency suite moves onto the fake, holding both callers'
// preflight listings through the list hook until both arrive; its stateful
// stub and cast retire.
// 2026-09-24 UTC: The base checkout suite moves onto the fake with seeded
// Subscriptions (contracted), the create-response override and the fault seams;
// its StripeClient literal, its spy-call cast and its this-binding stub retire.
// 2026-09-24 UTC: The reconciliation suite moves onto the fake, staging its racing
// Session through the retrieve override and injecting expiry errors through
// the fake's expire-fault seam; its stub and cast retire.
// 2026-09-24 UTC: The trial-recovery suite moves onto the fake with no new seam:
// it seeds the existing open Session and bends its inspection through the
// retrieve override; its stub and cast retire.
// 2026-09-24 UTC: The trials suite moves onto the fake, seeding existing open
// Sessions through real creates and reading the fake's recorded retrieve and
// expire calls; its stub, its spy-call cast and both floor sites retire.
// 2026-09-24 UTC: The recovery suite moves onto the fake too, seeding tied
// completed chains through real creates and injecting its one non-idempotency
// create error through the fake's create-fault seam; its stub and cast retire.
// 2026-09-24 UTC: The live-retrieve suite moves onto FakeStripeCheckoutClient's
// retrieve-override seam (step 5's zero-cost proof); its inline StripeClient
// stub and cast retire.
// 2026-09-24 UTC: The subscription unit suite keeps three error-translation
// cases on drizzle.mock; the tag and trial payment-method setup unit suites
// retire entirely behind their integration twins. No repository chain double
// remains.
export const UNKNOWN_DOUBLE_CAST_FLOORS = new Map<string, number>([
  ['app/(app)/app/billing/page.test.tsx', 1],
  ['app/(app)/app/practice/[sessionId]/page.test.tsx', 1],
  ['app/(app)/app/questions/[slug]/page.test.tsx', 1],
  ['app/api/stripe/webhook/route.test.ts', 2],
  ['app/pricing/page.test.tsx', 1],
  ['lib/container.skip-clerk.test.ts', 6],
  ['lib/container.test.ts', 6],
  ['src/adapters/controllers/controller-output-datetime-contract.test.ts', 2],
  ['src/adapters/gateways/stripe/stripe-subscription-normalizer.test.ts', 3],
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
  ['app/pricing/page-actions.test.tsx', 3],
  ['app/pricing/page.test.tsx', 3],
  ['lib/logger.test.ts', 1],
  ['src/adapters/controllers/question-view-controller.test.ts', 1],
  [
    'src/adapters/controllers/stripe-webhook-controller-renewal-acknowledgment.test.ts',
    2,
  ],
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
