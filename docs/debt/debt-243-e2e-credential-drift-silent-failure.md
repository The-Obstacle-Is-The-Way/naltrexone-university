# DEBT-243: E2E Credential Drift and Silent Failure (Definitive Resolution)

**Status:** Implemented  
**Date:** 2026-02-23  
**Owner:** Test Infrastructure

## Implementation Completed

Implemented in code with tests:

- E2E preflight module: `tests/e2e/helpers/credential-health-check.ts`
- E2E preflight tests: `tests/e2e/helpers/credential-health-check.test.ts`
- Playwright setup integration: `tests/e2e/global.setup.ts`
- CI guard for dummy/missing E2E secrets: `.github/workflows/ci.yml`
- Runtime Sentry disabled warning policy: `instrumentation.ts`, `sentry-config.test.ts`, `.env.example`
- Cron unauthorized observability logs: `app/api/cron/reconcile-stripe-subscriptions/route.ts`, `app/api/cron/reconcile-stripe-subscriptions/route.test.ts`

## Problem

We fixed one incident (wrong `E2E_CLERK_USER_PASSWORD`), but not the structural failure mode.

Current E2E behavior still allows credential drift to surface as late, repeated, low-signal failures:

- `tests/e2e/global.setup.ts` silently skips subscription seeding when env is missing.
- `tests/e2e/helpers/clerk-auth.ts` only checks credential presence, not validity.
- Invalid-but-present credentials fail later inside Clerk/Stripe/DB SDK calls.

This debt item standardizes one fail-fast preflight check that runs once before E2E specs.

## Full System Audit (Current State)

### 1. E2E pipeline behavior today

- `tests/e2e/global.setup.ts`
  - Runs `clerkSetup()`.
  - Skips seeding when `E2E_CLERK_USER_USERNAME` or `STRIPE_SECRET_KEY` is missing (`setup.skip()`), which is low-signal for credential drift.
- `tests/e2e/helpers/clerk-auth.ts`
  - `hasClerkCredentials` is a truthiness guard (`username && password`), so stale credentials still pass the gate.
  - Wrong password fails only when `signInWithClerkPassword()` reaches Clerk APIs.

### 2. Test infrastructure env dependencies

`tests/` currently depends on:

- `DATABASE_URL`
- `ALLOW_NON_LOCAL_DATABASE_URL`
- `CLERK_SECRET_KEY`
- `E2E_CLERK_USER_USERNAME`
- `E2E_CLERK_USER_PASSWORD`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`

Failure behavior today:

- **Loud early failures:** integration setup (`tests/integration/setup.ts`) for invalid/missing DB config.
- **Silent/low-signal behavior:** E2E seeding skip in `global.setup.ts`; Clerk password drift not detected until first login action.

### 3. Environment contract vs runtime validation

External credentials in `.env.local` include:

- Neon/Postgres: `DATABASE_URL`
- Clerk: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`
- Stripe: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`, `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`
- Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`
- Cron auth: `CRON_SECRET`
- E2E auth: `E2E_CLERK_USER_USERNAME`, `E2E_CLERK_USER_PASSWORD`

Audit findings:

- `lib/env.ts` enforces strong validation for DB, Stripe, and Clerk rules.
- E2E credentials are intentionally outside `lib/env.ts` and read directly by Playwright helpers, so test infrastructure must do its own correctness validation.
- Sentry DSNs are not validated by `lib/env.ts`; server/client Sentry bootstraps intentionally no-op when DSN is unset (`instrumentation.ts`, `sentry.client.config.ts`), so telemetry loss can be silent.
- `.env.example` and runtime expectations are not fully aligned for non-E2E concerns (notably Sentry/`CRON_SECRET` semantics), which creates separate drift risk outside this debt item's E2E scope.

### 4. CI secret handling

`.github/workflows/ci.yml` uses dummy fallbacks for several Clerk/Stripe values. This avoids hard CI failure for missing secrets but can mask drift until runtime behavior fails.

## Drift Risk Matrix

| Credential | Used by E2E setup path | If missing today | If wrong/stale today | Risk class |
|---|---:|---|---|---|
| `DATABASE_URL` | Yes | Loud throw (integration + seeder) | Loud DB connect error | Noisy |
| `CLERK_SECRET_KEY` | Yes | Loud throw in seeder | Loud Clerk API error | Noisy |
| `E2E_CLERK_USER_USERNAME` | Yes | Seeder skip path in global setup; spec-level skips | Clerk login fails later | Silent/late |
| `E2E_CLERK_USER_PASSWORD` | Yes | Spec-level skips / missing-credential throw | Clerk login fails later | Silent/late |
| `STRIPE_SECRET_KEY` | Yes | Seeder skip path in global setup | Stripe API error during seeding | Silent when missing, noisy when stale |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` | Yes (seeding) | Loud throw in seeder | Stripe invalid-price error | Noisy |
| `CRON_SECRET` | No (not in E2E setup) | Not validated by E2E today | Runtime cron auth mismatch risk | Separate debt |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | No (not in E2E setup) | Not blocking E2E | Telemetry loss risk | Separate debt |

## Definitive Decision

Implement **one** fail-fast credential preflight in E2E global setup.

There is no Option A/Option B split anymore.

### Final architecture

- Add `tests/e2e/helpers/credential-health-check.ts`.
- Add `runE2ECredentialHealthCheck()` that executes a small validator list.
- Call it once from `tests/e2e/global.setup.ts` before seeding/spec execution.
- Remove silent `setup.skip()` behavior for missing E2E seed credentials.
- Throw one aggregated, actionable error if any check fails.

This satisfies:

- **Single Responsibility:** one module owns credential health checks.
- **Dependency Inversion:** validators are abstractions (`CredentialValidator`) invoked by orchestrator.
- **Open/Closed:** add new validators by appending to a list, no orchestrator rewrite.
- **No over-engineering:** exactly 3 service validators (DB, Clerk, Stripe) because these are actual E2E setup dependencies.

## Concrete Implementation Spec (Do This Exactly)

### A. New module: `tests/e2e/helpers/credential-health-check.ts`

```ts
import Stripe from 'stripe';
import { Client } from 'pg';

type CredentialValidator = {
  id: string;
  run: () => Promise<void>;
};

class CredentialValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fix: string,
  ) {
    super(message);
    this.name = 'CredentialValidationError';
  }
}

export async function runE2ECredentialHealthCheck(): Promise<void> {
  const validators: CredentialValidator[] = [
    databaseValidator,
    clerkValidator,
    stripeValidator,
  ];

  const failures: CredentialValidationError[] = [];

  for (const validator of validators) {
    try {
      await validator.run();
    } catch (error) {
      if (error instanceof CredentialValidationError) {
        failures.push(error);
        continue;
      }

      failures.push(
        new CredentialValidationError(
          'E2E_PREFLIGHT:UNEXPECTED',
          `[${validator.id}] Unexpected preflight error: ${String(error)}`,
          'Inspect the stack trace above and fix the validator implementation or external dependency.',
        ),
      );
    }
  }

  if (failures.length > 0) {
    const lines = [
      `[E2E_PREFLIGHT] Credential validation failed (${failures.length}):`,
      ...failures.flatMap((failure, index) => [
        `${index + 1}. [${failure.code}] ${failure.message}`,
        `   Fix: ${failure.fix}`,
      ]),
    ];

    throw new Error(lines.join('\n'));
  }
}
```

### B. Required validators (blocking)

1. `databaseValidator`

- Validate `DATABASE_URL` is present.
- Open `pg` connection and run `SELECT 1`.
- Close connection.

Error messages:

- `[E2E_PREFLIGHT:DATABASE_URL_MISSING] DATABASE_URL is missing.`
  - Fix: `Set DATABASE_URL in .env.local (dev) or repository secrets (CI).`
- `[E2E_PREFLIGHT:DATABASE_CONNECT_FAILED] Cannot connect to Postgres with DATABASE_URL.`
  - Fix: `Verify Neon/Postgres URL, credentials, and network reachability.`

2. `clerkValidator`

- Validate presence of `CLERK_SECRET_KEY`, `E2E_CLERK_USER_USERNAME`, `E2E_CLERK_USER_PASSWORD`.
- Use Clerk Backend API with `CLERK_SECRET_KEY`:
  - Resolve user by email (`E2E_CLERK_USER_USERNAME`).
  - Call `verify_password` for that user with `E2E_CLERK_USER_PASSWORD`.

Error messages:

- `[E2E_PREFLIGHT:CLERK_SECRET_KEY_MISSING] CLERK_SECRET_KEY is missing.`
  - Fix: `Set CLERK_SECRET_KEY in .env.local or CI secrets.`
- `[E2E_PREFLIGHT:CLERK_SECRET_KEY_INVALID] Clerk rejected CLERK_SECRET_KEY.`
  - Fix: `Set CLERK_SECRET_KEY in .env.local or CI secrets.`
- `[E2E_PREFLIGHT:E2E_CLERK_USER_USERNAME_MISSING] E2E_CLERK_USER_USERNAME is missing.`
  - Fix: `Set E2E_CLERK_USER_USERNAME to the E2E Clerk user email.`
- `[E2E_PREFLIGHT:E2E_CLERK_USER_PASSWORD_MISSING] E2E_CLERK_USER_PASSWORD is missing.`
  - Fix: `Set E2E_CLERK_USER_PASSWORD to match the Clerk E2E user password.`
- `[E2E_PREFLIGHT:CLERK_USER_NOT_FOUND] Clerk user "<email>" was not found.`
  - Fix: `Create that user in Clerk Dashboard or update E2E_CLERK_USER_USERNAME.`
- `[E2E_PREFLIGHT:CLERK_PASSWORD_INVALID] Password for Clerk user "<email>" is out of sync.`
  - Fix: `Reset password in Clerk and update E2E_CLERK_USER_PASSWORD to the same value.`
- `[E2E_PREFLIGHT:CLERK_API_UNAVAILABLE] Clerk API request failed (5xx/timeout).`
  - Fix: `Retry after Clerk/API network recovery; do not change secrets until availability is restored.`

3. `stripeValidator`

- Validate presence of `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`.
- Use Stripe SDK in test mode:
  - `stripe.accounts.retrieve()` to validate API key.
  - `stripe.prices.retrieve(NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY)` to validate price ID.

Error messages:

- `[E2E_PREFLIGHT:STRIPE_SECRET_KEY_MISSING] STRIPE_SECRET_KEY is missing.`
  - Fix: `Set STRIPE_SECRET_KEY in .env.local or CI secrets.`
- `[E2E_PREFLIGHT:STRIPE_MONTHLY_PRICE_ID_MISSING] NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY is missing.`
  - Fix: `Set NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY to a valid Stripe test price ID.`
- `[E2E_PREFLIGHT:STRIPE_SECRET_KEY_INVALID] Stripe rejected STRIPE_SECRET_KEY.`
  - Fix: `Use a valid Stripe test secret key (sk_test_...).`
- `[E2E_PREFLIGHT:STRIPE_MONTHLY_PRICE_ID_INVALID] Stripe price "<id>" was not found.`
  - Fix: `Update NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY to an existing test-mode price ID.`

### C. Global setup integration: `tests/e2e/global.setup.ts`

Replace current silent seeding skip path with hard preflight gate.

```ts
import { runE2ECredentialHealthCheck } from './helpers/credential-health-check';

async function globalSetup(config: FullConfig) {
  await runE2ECredentialHealthCheck();
  await clerkSetup();
  await seedTestSubscription();
}
```

Required behavior:

- Preflight runs once.
- Any failed check aborts the suite immediately with one aggregated error.
- No `setup.skip()` for missing E2E seed credentials.

## Scope Boundary (Explicit)

This debt item covers credentials required for deterministic E2E execution: **DB + Clerk + Stripe**.

- `CRON_SECRET` and Sentry DSNs are real drift risks, but they are not consumed by E2E setup path.
- They are handled by runtime modules (`app/api/cron/reconcile-stripe-subscriptions/route.ts`, `instrumentation.ts`, `sentry.client.config.ts`) and must be hardened in separate debt work, not in this E2E preflight module.
- Post-implementation E2E instability unrelated to credential correctness (schema/state/spec drift) is tracked separately in [DEBT-244](debt-244-test-reliability-schema-and-state-drift.md).

## Required Companion Follow-Ups (System-Wide)

DEBT-243 is complete only for E2E preflight. The broader credential-drift program is complete only when all items below are tracked and implemented.

1. Runtime observability credential hardening
- Keep startup behavior non-blocking, but explicit: when both `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are missing in production runtime, emit one structured startup warning that Sentry is disabled.
- Align `.env.example` and `lib/env.ts` comments to this exact policy so operators do not assume DSNs are hard-required at startup.

2. CI secret fallback hardening
- In `.github/workflows/ci.yml`, add a guard step that fails E2E jobs when dummy placeholders are used for required E2E path credentials (`DATABASE_URL`, `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`, `E2E_CLERK_USER_USERNAME`, `E2E_CLERK_USER_PASSWORD`).
- Remove masked pass behavior for credential drift in E2E lanes.

3. Cron credential observability
- Keep route-level auth enforcement in `app/api/cron/reconcile-stripe-subscriptions/route.ts` as source of truth.
- Add monitoring/alerting for repeated `401` and `503 CRON_SECRET is not configured` responses so secret drift is operationally visible.

## Dev vs CI vs Production Validation

- **Dev (local E2E):** preflight validates live DB/Clerk/Stripe credentials before browser tests start.
- **CI (Playwright):** preflight fails loudly when secrets are dummy/missing/stale; no masked skip path.
- **Production runtime:** still governed by `lib/env.ts` + runtime handlers; this debt does not alter production startup logic.

## Verification Plan (Required)

Run each scenario by editing env values and executing `pnpm test:e2e`.

1. `DATABASE_URL` missing
- Expected: one setup failure with `[E2E_PREFLIGHT:DATABASE_URL_MISSING]`.

2. `DATABASE_URL` invalid host/password
- Expected: one setup failure with `[E2E_PREFLIGHT:DATABASE_CONNECT_FAILED]`.

3. `CLERK_SECRET_KEY` missing
- Expected: one setup failure with `[E2E_PREFLIGHT:CLERK_SECRET_KEY_MISSING]`.

4. `CLERK_SECRET_KEY` invalid
- Expected: one setup failure with `[E2E_PREFLIGHT:CLERK_SECRET_KEY_INVALID]`.

5. `E2E_CLERK_USER_USERNAME` typo (nonexistent user)
- Expected: one setup failure with `[E2E_PREFLIGHT:CLERK_USER_NOT_FOUND]`.

6. `E2E_CLERK_USER_PASSWORD` wrong
- Expected: one setup failure with `[E2E_PREFLIGHT:CLERK_PASSWORD_INVALID]`.

7. `STRIPE_SECRET_KEY` invalid
- Expected: one setup failure with `[E2E_PREFLIGHT:STRIPE_SECRET_KEY_INVALID]`.

8. `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` invalid
- Expected: one setup failure with `[E2E_PREFLIGHT:STRIPE_MONTHLY_PRICE_ID_INVALID]`.

9. Multiple invalid credentials at once
- Expected: one aggregated failure listing all failing checks, each with a `Fix:` line.

## Acceptance Criteria

- No option language remains in this debt item.
- E2E credential drift cannot produce repeated downstream auth failures before a clear setup error.
- Global setup emits a single actionable failure report when credentials drift.
- Adding a new credential check requires only adding one validator to the list.
