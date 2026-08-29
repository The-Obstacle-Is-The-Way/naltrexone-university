# Testing Infrastructure

**Last Updated:** 2026-08-28

This document covers our E2E testing tools: Playwright and Vercel's agent-browser.

---

## Overview

| Tool | Purpose | When to Use |
| ---- | ------- | ----------- |
| **Playwright** | Scripted E2E tests | Regression testing, CI validation |
| **Agent-Browser** | AI-driven exploration | Autonomous bug discovery, exploratory testing |
| **Webapp-Testing Skill** | Python Playwright helpers | Complex automation scenarios |

---

## Playwright

### Configuration

**File:** `playwright.config.ts`

```ts
testDir: './tests/e2e',
fullyParallel: false,
retries: process.env.CI ? 2 : 1,
workers: 1,
reporter: [['html', { open: 'never' }], ['list']],
projects: [
  { name: 'setup' },
  {
    name: 'chromium',
    dependencies: ['setup'],
    testIgnore: /stripe-hosted-.*\.spec\.ts/,
  },
  {
    name: 'stripe-hosted',
    dependencies: ['setup'],
    testMatch: /stripe-hosted-.*\.spec\.ts/,
  },
],
webServer: {
  command: process.env.CI ? 'pnpm start' : 'pnpm build && pnpm start',
  url: `${baseURL}/api/health`,
  reuseExistingServer: false,
  timeout: 120000,
},
```

- Uses `NEXT_PUBLIC_APP_URL` or defaults to `http://127.0.0.1:3000`
- Runs Chromium only (for now)
- `pnpm test:e2e` selects the required `chromium` project and excludes every `stripe-hosted-*.spec.ts` file
- The `stripe-hosted` project is an observational compatibility probe for Stripe-owned Checkout markup; it is scheduled/manual and never a pull-request or push check
- The HTML report is retained as an artifact and configured with `open: 'never'`, so a locally recovered flaky run cannot hold the process open. Both E2E workflows keep tracing local, upload the HTML report after every non-cancelled run, upload `test-results/` only after an E2E failure, and exclude auth state plus trace archives from both artifacts. [BUG-307](../_archive/bugs/bug-307-public-playwright-artifacts-expose-test-session-credentials.md) is resolved after the promoted one-file report contained zero auth-state files, traces, or unredacted credential-shape files under a non-printing scan.
- Starts a production server for E2E runs (`pnpm build && pnpm start` locally, `pnpm start` in CI)
- Waits on `/api/health`, not just the root URL, so Playwright startup includes a DB-aware readiness check
- Runs with **1 worker** because authenticated E2E flows share one Clerk user; mutating specs still reset that user to a deterministic baseline in `beforeEach`
- Local `pnpm test:e2e` runs through `scripts/run-local-e2e.ts`, which mirrors CI by preparing a local Docker Postgres first and then invoking Playwright with the Docker `DATABASE_URL`

### Playwright Timeout Policy

Timeout usage is policy-controlled. Do not introduce ad-hoc values.

1. **Default first:** Use Playwright defaults unless the flow demonstrably exceeds them.
2. **Prefer assertion-level waits:** Use locator/assertion timeouts for specific async UI points before escalating test-level timeout.
3. **Use `test.setTimeout(...)` only for whole-flow budget increases** when setup + navigation + assertions legitimately require more wall-clock time.
4. **Document every non-default timeout with a rationale comment** directly above the call.

Current approved `test.setTimeout` bands in `tests/e2e/**/*.spec.ts`:

- `120_000`: standard authenticated flows with Clerk + seeded subscription setup.
- `180_000`: multi-page audits or long navigation chains.
- `300_000`: temporary outlier only where explicitly justified in-file.

Current repo posture:

- `playwright.config.ts` sets `webServer.timeout` (server startup budget).
- No global `timeout` / `expect.timeout` overrides are set in Playwright config.
- `test.slow()` is not currently used in `tests/e2e/**/*.spec.ts`.

### Existing Tests

| File | Purpose |
| ---- | ------- |
| `tests/e2e/global.setup.ts` | Shared setup (Playwright project dependency) |
| `tests/e2e/smoke.spec.ts` | Marketing smoke (home, pricing) |
| `tests/e2e/pricing-unauthenticated.spec.ts` | Pricing behavior for signed-out users |
| `tests/e2e/theme-preference.spec.ts` | Theme preference persistence |
| `tests/e2e/dark-mode.spec.ts` | Dark mode toggle and OS preference |
| `tests/e2e/marketing-contrast.spec.ts` | Marketing contrast regression checks |
| `tests/e2e/subscribe.spec.ts` | Subscription verification (API-seeded) |
| `tests/e2e/checkout-redirect.spec.ts` | Required monthly-trial and paid-annual CTA → Stripe-origin boundary checks; no Stripe DOM interaction |
| `tests/e2e/checkout-success-provider.spec.ts` | Required real-Stripe contract for application-created Session parameters/open rejection plus CLI-triggered completion → real success sync → Postgres persistence → entitlement |
| `tests/e2e/stripe-hosted-trial-start.spec.ts` | Scheduled/manual observational no-card hosted Checkout journey |
| `tests/e2e/stripe-hosted-paid-checkout.spec.ts` | Scheduled/manual observational paid annual hosted Checkout journey |
| `tests/e2e/subscribe-and-practice.spec.ts` | Subscribe + answer a question |
| `tests/e2e/practice.spec.ts` | Practice session answering flow |
| `tests/e2e/session-continuation.spec.ts` | Resume incomplete session |
| `tests/e2e/bookmarks.spec.ts` | Bookmarks CRUD flow |
| `tests/e2e/core-app-pages.spec.ts` | Entitled app pages load |
| `tests/e2e/cross-page-navigation.spec.ts` | Cross-page navigation flows |
| `tests/e2e/session-review-navigation.spec.ts` | Session review with prev/next navigation (SPEC-027/028) |
| `tests/e2e/review-mode-audit.spec.ts` | Review mode read-only audit |
| `tests/e2e/history.spec.ts` | History page flows |

### Running E2E Tests

```bash
# Run the required E2E project against local Docker Postgres.
# This starts the isolated per-clone Docker test DB, migrates, seeds
# placeholder content, and then runs Playwright against the resolved
# local app/database target.
pnpm test:e2e

# Run the unsupported Stripe-hosted compatibility probes explicitly.
# This is observational and is not part of the pre-push or merge gate.
pnpm test:e2e:stripe-hosted

# Run a specific test file through the same database-isolated local flow.
# Clerk and Stripe test-mode calls remain networked external dependencies.
pnpm test:e2e -- tests/e2e/smoke.spec.ts

# Run with UI (interactive)
pnpm test:e2e -- --ui

# Debug mode
pnpm test:e2e -- --debug
```

These commands still execute the setup project by default. If your goal is to run an unauthenticated spec without the authenticated preflight, you must opt out of project dependencies explicitly.

### Environment Variables for E2E

Both Playwright projects assume authenticated E2E infrastructure because `tests/e2e/global.setup.ts` always runs first. For a normal `pnpm test:e2e` run or an explicit `pnpm test:e2e:stripe-hosted` run, these must be present:

```bash
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
E2E_CLERK_USER_USERNAME=test@example.com
E2E_CLERK_USER_PASSWORD=your-password
E2E_STRIPE_OWNER=local-dev
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL=price_...
```

Locally, these can be provided via `.env.local` (loaded by `playwright.config.ts`). The local `DATABASE_URL` is supplied by `scripts/run-local-e2e.ts`, not `.env.local`: it resolves the current clone's local test target through `scripts/resolve-local-test-target.ts`, starts that target's Docker Compose project, migrates, and seeds with `SEED_INCLUDE_PLACEHOLDERS=true` before Playwright starts. The same target also supplies `PORT` and `NEXT_PUBLIC_APP_URL`, so concurrent clones do not share the app server port. CI still supplies its own Docker-service `DATABASE_URL` through `.github/workflows/ci.yml`.

Normal local `pnpm test:e2e` runs reuse that per-clone Docker database; they do not tear it down or reset its volume. Only `pnpm db:test:reset` invokes `docker compose down -v`. Checkout Sessions created by the required redirect-boundary tests and by explicit hosted-smoke runs can remain deterministic recovery-chain rungs while Stripe retains their idempotency keys. [DEBT-466](../debt/debt-466-checkout-idempotency-replay-chain-exhaustion.md) and [DEBT-470](../debt/debt-470-checkout-replay-tail-jump.md) retain provider-faithful blocking contract coverage for that traversal; do not rotate the user or drop the database volume to mask a traversal failure.

The temporary local `assertLocalTrialCheckoutReplayCapacity()` guard and `[E2E_CHECKOUT_CHAIN_SATURATED]` push exception were removed when DEBT-470 landed the subscription tail jump. The 2026-08-17 characterization had found 11 current-tuple completed Sessions inside 24 hours against the old fallback cap 10. The structural fix now selects a unique exact-metadata tail through a bounded provider list and keeps the old rung walk only as a safe fallback; retained-chain length no longer defines the healthy exact-match path's recovery-create depth. Any failure before the Stripe-origin boundary remains blocking. Failures inside `stripe-hosted-*.spec.ts` are observational provider-compatibility failures, not evidence that a candidate commit is wrong. Stripe's 24-hour statement remains only the earliest pruning eligibility, not an exact deletion deadline.

Both executable journey projects depend on the `setup` project, which runs the shared credential preflight and seed/reset pass before either project starts. Missing or invalid credentials therefore fail the suite fast instead of silently skipping it. The former fourteen per-spec `test.skip(!hasClerkCredentials, ...)` guards were deleted under DEBT-473; the parser-backed skip-policy scan keeps their floor at zero, so suite setup remains the single fail-closed credential gate.

To intentionally validate a real deploy-target database instead of the local Docker database, opt out explicitly and prefix the target URL. This is not the default local flow:

```bash
DEPLOY_TARGET_DATABASE_URL="$(node -e "require('dotenv').config({ path: '.env.local', quiet: true }); const url = process.env.DATABASE_URL; if (!url) throw new Error('Missing DATABASE_URL in .env.local'); process.stdout.write(url)")"
node -e "const u = new URL(process.argv[1]); console.log(u.hostname)" "$DEPLOY_TARGET_DATABASE_URL"
E2E_USE_EXISTING_DATABASE=true ALLOW_NON_LOCAL_DATABASE_URL=true DATABASE_URL="$DEPLOY_TARGET_DATABASE_URL" pnpm test:e2e
```

Do not rely on implicit `.env.local` resolution for deploy-target checks or migrations. Verify the host, then prefix the command with the exact `DATABASE_URL` you intend to use. Never run `db:migrate` against a remote target unless you intentionally mean to mutate that target.

The E2E credential preflight includes DEBT-391's migration-ledger check: it compares the active database against `db/migrations/meta/_journal.json` before seed/reset. The default local Docker flow also migrates first, so the check should pass by construction; it remains useful for explicit deploy-target runs.

### Test Data Seeding

Required subscription setup is seeded via the Stripe API and direct DB writes in `global.setup.ts` — **no Stripe UI automation participates in merge eligibility**. The separately selected `stripe-hosted` project still drives Checkout markup as an unsupported observational probe.

The setup project currently runs three steps, in this order:

1. `runE2ECredentialHealthCheck()` validates the required env vars and checks:
   - database connectivity
   - `idempotency_keys.completed_at` schema presence
   - Clerk user existence + password validity
   - Stripe secret-key validity (TEST-mode `sk_test_` shape enforced fail-closed before any Stripe call — global setup mutates provider state, so live-mode keys are rejected at env resolution)
   - Stripe monthly and annual price-ID validity, including plan shape: active, recurring, and billed every 1 month / 1 year (`interval_count` enforced)
2. `seedTestSubscription()` idempotently ensures:
   - the E2E user exists in `users`
   - a Stripe customer exists for the current `E2E_STRIPE_OWNER` and is mirrored in `stripe_customers`
   - an active owner-scoped subscription exists and is mirrored in `stripe_subscriptions`
3. `runE2EUserStateReset()` clears mutable user state and reseeds a deterministic baseline

`seedTestSubscription()` ensures:

1. The test user exists in the `users` table (matched by email, Clerk user ID resolved via Clerk API)
2. A Stripe customer exists for `metadata.e2e_owner === E2E_STRIPE_OWNER` (checked in DB, then Stripe API, created if needed) and is mirrored in `stripe_customers`
3. An active owner-scoped subscription exists (using `pm_card_visa` test payment method) and is mirrored in `stripe_subscriptions`

`global.setup.ts` also seeds a deterministic baseline for the shared authenticated E2E user once per suite run. That suite-level reset is not enough for mutating specs on its own: any spec that writes sessions, attempts, or bookmarks should call `runE2EUserStateReset()` in `beforeEach` so every test starts from the same baseline rather than inheriting artifacts from earlier files or retries.

`checkout-redirect.spec.ts` uses the same reset/reseed lifecycle to prove both required application-owned transitions: an eligible first-timer's monthly trial CTA and a returning user's paid annual CTA each resolve a real Checkout Session and cross onto the `checkout.stripe.com` origin. Required CI performs no selector action or assertion after that boundary. The two `stripe-hosted-*.spec.ts` files reuse the lifecycle only in the scheduled/manual compatibility project. Individual test-mode subscription objects are disposable fixture state; the shared user and customer identities are not.

`checkout-success-provider.spec.ts` restores a blocking post-boundary contract without scraping Checkout. Stripe's public [Checkout Sessions API](https://docs.stripe.com/api/checkout/sessions) has no operation that completes an arbitrary existing Session. Stripe's supported [`stripe trigger checkout.session.completed`](https://docs.stripe.com/cli/trigger) command does create the necessary real test-mode API objects and side-effect events. The required contract therefore proves two adjacent seams: it retrieves the Session created by the production use case and asserts its parameters plus rejection while `open`, then creates a separate completed Session through the supported trigger and passes that Session through the production `/checkout/success` synchronization, real Drizzle repositories, and entitlement use case. It covers a paid annual subscription and a cardless monthly trial. Do not replace the supported trigger with the CLI fixture's private payment-page endpoint or claim that the CLI can complete the application-created Session.

### Stripe network ownership and failure bounds

The local Docker database makes database state isolated, not the E2E suite hermetic. Every row below deliberately depends on Stripe test mode and can fail independently of the candidate diff. Direct helper clients use a 15-second request timeout and one SDK network retry; Playwright's setup/default or explicit test timeout is the outer bound.

| Networked surface | Required lane | Scheduled/manual lane | Failure bound |
| ---- | ---- | ---- | ---- |
| `credential-health-check.ts` — Account and configured Price retrieval | setup dependency | setup dependency | 15 seconds/request + one retry; 30-second setup-test outer bound |
| `seed-test-user.ts` — Customer, PaymentMethod, and Subscription list/retrieve/create/update/cancel/attach | setup dependency | setup dependency | 15 seconds/request + one retry; 30-second setup-test outer bound |
| `subscription.ts` — Customer, PaymentMethod, and Subscription reset/restore/evidence calls | redirect and provider-contract lifecycle | both hosted journeys | 15 seconds/request + one retry; 120-second spec outer bound |
| `paid-checkout.ts` — lifecycle plus Subscription/Invoice/Invoice Payment/PaymentIntent evidence | lifecycle calls; equivalent paid evidence is independently asserted by the provider contract | full evidence in the paid hosted journey | 15 seconds/request + one retry; 120-second spec outer bound |
| `stripe-hosted-checkout.ts` — browser navigation and form submission to `checkout.stripe.com` | none | both hosted journeys | 30-second hosted locator/navigation assertions inside a 120-second spec |
| Production Checkout Session list/retrieve/create/expire and Subscription list | redirect and provider-contract specs | both hosted journeys | production retry policy inside a 120-second spec |
| Stripe CLI completed-Session trigger and success-sync Session/Subscription retrieval | annual + cardless-trial provider-contract specs | none | 30-second CLI subprocess; 15 seconds/request + one retry; 120-second spec outer bound |
| `FakeStripeCheckoutClient` fake↔provider contract — Customer and Checkout Session create/retrieve/expire/list | none; normal integration runs skip without the explicit opt-in | weekly/manual `stripe-trial-clock-smoke.yml` provider-contract job via `pnpm test:stripe-provider` | 20-second scheduled test bound plus a five-minute fail-closed process-tree bound inside a ten-minute job |

`workers: 1` remains deliberate. Parallel workers require proof of independent database users, Clerk sessions, Stripe owner/customer namespaces, rate-limit keys, and cleanup; per-worker usernames alone do not establish that contract.

The scheduled Stripe runner requires six named cases: the two trial-clock outcomes plus four `FakeStripeCheckoutClient` scenarios for frozen idempotent replay versus live retrieval, reverse-chronological cursor pagination with `has_more`, terminal-Session visibility, and same-key/different-parameter rejection. `pnpm test:stripe-provider` is the one supported manual entry point; it loads `.env.local` without overriding exports, validates the TEST-mode key and Price through the shared provider gate, and injects both `RUN_STRIPE_*` flags only into its bounded child process. The ordinary integration lane stays credential-free and reports all six cases as skipped. The child receives a 20-second scheduled-only test budget because a healthy live trial-clock case was measured at 10.28 seconds, just beyond the ordinary integration lane's global 10-second budget; the existing five-minute process-tree limit remains the outer failure bound. The runner rejects a zero-exit skip, a missing/duplicate file or case, any non-passing case, and malformed reporter output. The 2026-08-26 local activation receipt was `PASS executed=6 passed=6 skipped=0`; hosted run `33038731445` supplied the same six-case receipt at verified `main` head `3162a7be91e57eb5c66f0575d675414c91646991` on 2026-08-27.

### Writing New E2E Tests

```typescript
import { expect, test } from '@playwright/test';

test.describe('feature name', () => {
  test('user can do X', async ({ page }) => {
    await page.goto('/path');

    // Use role-based selectors (accessibility-friendly)
    await page.getByRole('button', { name: 'Submit' }).click();

    // Assert on visible content
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

**Best Practices:**
- Use `getByRole()`, `getByLabel()`, `getByText()` over CSS selectors
- Prefer locator/assertion waits over `waitForLoadState('networkidle')`; use `networkidle` only when it is the correct readiness signal for that page
- Use `expect(locator).toBeVisible()` not `isVisible()`

---

## Agent-Browser (Vercel)

### What Is It?

Vercel's agent-browser is an AI-powered CLI that lets AI agents control Chrome for autonomous testing and exploration. Unlike Playwright (scripted), agent-browser explores intelligently.

**Install:**
```bash
npm install -g agent-browser
```

**Install browser binaries (first time):**
```bash
agent-browser install
```

**Verify:**
```bash
agent-browser --version  # Confirm the CLI is installed and responding
```

### Core Concepts

1. **Accessibility Tree Snapshots** — Agent-browser works with the A11y tree, not raw DOM
2. **Refs** — Elements are referenced as `@e1`, `@e2`, etc. (not CSS selectors)
3. **Non-Visual** — The AI "sees" the page structure, not pixels

### Basic Usage

```bash
# Open a page (starts the browser automatically)
agent-browser open http://localhost:3000

# Snapshot interactive elements (recommended)
agent-browser snapshot -i

# Interact using @refs from the snapshot
agent-browser click @e1
agent-browser fill @e2 "text"
agent-browser wait --load networkidle

# Evidence
agent-browser screenshot /tmp/agent-browser.png --full

# Cleanup
agent-browser close
```

### Authenticated Exploration

By default, `agent-browser` does **not** load `.env.local`. For authenticated exploration, the recommended approach is loading a Playwright `storageState` file (see below). For local-only workflows, you can also export env vars in your current shell session (e.g., `set -a && source .env.local && set +a`) and then run your `agent-browser …` commands in that same shell.

See [agent-browser.md](../tooling/agent-browser.md) for a focused quick reference and multiple auth options.

1) Create a temporary script that signs in via Clerk and saves `storageState`:

```ts
// scripts/tmp-create-agent-browser-state.ts (do not commit)
import { clerkSetup, clerk } from '@clerk/testing/playwright';
import { config } from 'dotenv';
import { chromium } from '@playwright/test';

async function main() {
  config({ path: '.env.local', quiet: true });
  config({ path: '.env', quiet: true });

  const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';
  const username = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;

  if (!username || !password) throw new Error('Missing Clerk E2E credentials');

  await clerkSetup();
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'password', identifier: username, password },
  });

  await page.goto('/app/dashboard');
  await context.storageState({ path: '/tmp/agent-browser-state.json' });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

2) Run it:

```bash
pnpm tsx scripts/tmp-create-agent-browser-state.ts
```

3) Use agent-browser with the saved state:

```bash
agent-browser --state /tmp/agent-browser-state.json open http://localhost:3000/app/dashboard
```

If you prefer to log in “by hand”, you can also use `--profile` to persist cookies across sessions:

```bash
agent-browser --profile /tmp/agent-browser-profile open http://localhost:3000/sign-in
```

**Command reference:** `.agents/skills/agent-browser/SKILL.md`

---

## Webapp-Testing Skill

**Location:** `.agents/skills/webapp-testing/`

Python-based Playwright helpers for complex automation.

### Available Scripts

| Script | Purpose |
| ------ | ------- |
| `scripts/with_server.py` | Manages server lifecycle during tests |

### Example Usage

```bash
# Start server and run automation
python .agents/skills/webapp-testing/scripts/with_server.py \
  --server "pnpm dev" --port 3000 \
  -- python your_script.py
```

### When to Use

- Complex multi-step scenarios
- Screenshot-based debugging
- Console log analysis
- When you need synchronous Python control

---

## CI Integration

### GitHub Actions

CI runs the required E2E layer only on pushes and human same-repo PRs, because it needs repository secrets; Dependabot and fork PRs skip it. Browser installation and all 398 browser tests run on every trigger because they need no provider credential. A final `Evidence summary` step reads the actual unit, integration, browser, Build, and E2E `steps.<id>.outcome` values, runs after failures with `if: ${{ !cancelled() }}`, and writes skipped evidence plus a warning instead of letting the aggregate green stand alone ([DEBT-473](../debt/debt-473-green-without-evidence.md) F5, step 3). Fork PRs run typecheck, lint, unit, integration, browser, and build; the Build step uses real public values when available and shape-valid server-only placeholders. `.github/workflows/stripe-hosted-checkout-smoke.yml` runs only on its daily schedule or explicit dispatch, uses a separate `E2E_STRIPE_OWNER`, and selects only the observational `stripe-hosted` project. Both workflows upload `playwright-report/` after every non-cancelled run and upload `test-results/` only when their E2E step failed. Every upload excludes `**/.auth/**` and `**/trace.zip`; Playwright tracing is disabled in CI but remains `on-first-retry` locally. [BUG-307](../_archive/bugs/bug-307-public-playwright-artifacts-expose-test-session-credentials.md) records the promoted one-file artifact's zero-match scan and closure. Path-filtering the required workflow is intentionally deferred: required-check naming and skipped-workflow behavior can block merges or let a misclassified code change evade the lane, while the hosted split and bounded Chromium installer remove most of the incentive.

E2E runs in CI via Playwright (see `.github/workflows/ci.yml`):

```yaml
# .github/workflows/ci.yml (excerpt)
- name: Run E2E tests
  run: pnpm test:e2e
  env:
    E2E_USE_EXISTING_DATABASE: 'true'
    E2E_CLERK_USER_USERNAME: ${{ secrets.E2E_CLERK_USER_USERNAME }}
    E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}
    E2E_STRIPE_OWNER: github-ci
```

### Required Secrets

| Secret | Purpose |
| ------ | ------- |
| `E2E_CLERK_USER_USERNAME` | Test Clerk account username (email) |
| `E2E_CLERK_USER_PASSWORD` | Test Clerk account password |
| `E2E_STRIPE_OWNER` | Stripe test customer/subscription owner namespace (`github-ci` in CI; `local-dev` or a developer-specific value locally) |
| `CLERK_SECRET_KEY` | Clerk API key (used to resolve Clerk user ID during seeding) |
| `STRIPE_SECRET_KEY` | Stripe API key (used to create test subscriptions during seeding) |
| `DATABASE_URL` | CI Postgres connection string for direct DB writes during seeding; local `pnpm test:e2e` supplies the Docker URL automatically |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` | Stripe monthly price ID (used during subscription seeding) |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL` | Stripe annual price ID (validated for the required redirect and provider-backed success contract plus the observational hosted journey) |

---

## Test Coverage Gaps

Playwright coverage intentionally focuses on user-facing regression paths:

- Marketing pages + theme/dark-mode
- Auth + subscription (API-seeded, verified in-app) when E2E Clerk creds are present
- Practice sessions + continuation
- Review + bookmarks

For feature-level acceptance criteria and planned routes (e.g., Quick Practice at `/app/practice/quick`), track expected E2E additions in the relevant specs (e.g., SPEC-019 Phase 2 acceptance criteria).

---

## Troubleshooting

### Playwright won't start server

```bash
# Inspect this clone's resolved local target
pnpm exec tsx scripts/resolve-local-test-target.ts env

# Clear Next.js cache
rm -rf .next
```

Do not blanket-kill `:3000`. Local E2E uses a per-clone resolved `PORT`; if that port is already held, identify the holder and stop only the process you own.

### Agent-browser can't connect

Ensure Chrome is installed and not running with restrictive flags:
```bash
# macOS - kill Chrome completely
killall "Google Chrome"
```

### Agent-browser says “Browser not launched”

- Run `agent-browser install` (first-time setup)
- Then run `agent-browser close` and retry your `agent-browser open …` command

### Tests flaky on CI

**Do NOT reach for these band-aids:**
- Do not increase timeouts as a first response
- Do not add `waitForLoadState('networkidle')` without understanding why it helps
- Do not add `page.waitForTimeout(1000)` — this masks the root cause

**Instead, diagnose the structural root cause:**

1. **Does the failing test mutate server-side state** (sessions, attempts, bookmarks)?
   - If yes, prefer `runE2EUserStateReset()` in `beforeEach`. See `tests/e2e/helpers/reset-e2e-user-state.ts` for the full reset pattern that clears `idempotency_keys`, `attempts`, `bookmarks`, and `practice_sessions`, then reseeds the deterministic baseline.
2. **Does the failure only occur on retries** (passes on attempt 1, fails on retry)?
   - Suspect cascading state corruption: attempt 1 left database artifacts that retry inherits.
3. **Does the failure occur on CI but not locally?**
   - CI runners have fewer resources. Check if assertions need longer timeouts for legitimate async operations (not arbitrary waits).
4. **Is the test asserting on state created by a different test?**
   - This is a cross-spec dependency. Add explicit state setup in the affected test.

Use `resetBookmarksForE2EUser()` only when a test truly needs bookmark-only isolation and does not rely on session/attempt state.

See [DEBT-293](../_archive/debt/debt-293-e2e-shared-state-structural-flakiness.md) for the full analysis and the resolved reset strategy.

### Server actions hang / UI stuck on "Loading..."

**Symptoms:** Playwright screenshots show "Loading..." or skeleton states that never resolve. Server actions return no response. Tests time out with "locator timed out" errors that give no hint about the root cause.

**Most likely causes (in order):**

1. **Database availability:** normal local `pnpm test:e2e` targets Docker Postgres and should not hit Neon cold starts. If you intentionally opted into a deploy-target database with `E2E_USE_EXISTING_DATABASE=true`, Neon free-tier cold starts can take ~400-750ms. The postgres driver has a 30-second `connect_timeout` and automatic reconnection with exponential backoff, so this usually resolves itself. If tests still fail, verify the selected database is reachable:

   ```bash
   psql "$DATABASE_URL" -c "SELECT 1"
   ```

2. **Local app port conflict:** A previous dev server is still running but in a bad state, or `PORT` was overridden to collide with another process.

   ```bash
   pnpm exec tsx scripts/resolve-local-test-target.ts env
   ```

   Stop only the process you own. Do not use blanket `kill -9` on a shared port.

3. **Connection pool exhaustion:** The postgres driver defaults to `max: 10` connections. In dev, the singleton pattern (`globalForDb`) prevents accumulation across HMR reloads. If you suspect exhaustion, restart the dev server.

4. **Network partition / Neon outage:** This applies only to intentional deploy-target runs (`E2E_USE_EXISTING_DATABASE=true`) or app development against Neon. Check [Neon status page](https://neonstatus.com/). The `connect_timeout: 30` will fire and return an error within 30 seconds, but client-side server action calls are wrapped with `withTimeout` (SPEC-029), so the UI should fail fast (~10–15s) instead of hanging indefinitely.

**What the codebase already handles:**
- `connect_timeout: 30s` (postgres driver default) — connections time out
- `max_lifetime: 30-60 min` (random jitter) — connections are recycled
- `keep_alive: 60s` — detects broken TCP connections
- Exponential backoff with jitter on reconnection
- `createAction` try/catch wraps every server action
- Error boundaries on every route

**Client-side timeouts:** `lib/with-timeout.ts` wraps client-side server action calls (SPEC-029), preventing indefinite "Loading..." states. See [SPEC-029](../_archive/specs/spec-029-dev-environment-resilience.md).

---

## Related Documentation

- [react-vitest-testing.md](./react-vitest-testing.md) — React 19 + Vitest component testing setup
- [CLAUDE.md](../../CLAUDE.md) — Testing mandate and test locations
- [SPEC-010](../_archive/specs/spec-010-server-actions.md) — Controller testing patterns
- [Stripe vendor docs](../vendor-docs/stripe.md) — E2E test seeding pattern, test payment methods
- [Clerk vendor docs](../vendor-docs/clerk.md) — REST API for user lookup in E2E seeding
- [Playwright Docs](https://playwright.dev/docs/intro)
- [agent-browser.md](../tooling/agent-browser.md) — Agent-browser quick reference, auth patterns, common pitfalls
- `.agents/skills/agent-browser/SKILL.md` — Agent-browser CLI full command reference
