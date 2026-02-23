# DEBT-244: Test Reliability Drift (Schema + Stateful E2E Data + Spec Drift) (Resolved)

**Status:** Resolved  
**Date:** 2026-02-23  
**Owner:** Test Infrastructure

## Verification Note (2026-02-23)

The DEBT-244 resolution was re-audited against live repository state. All previously open items are implemented.

- [x] Deterministic E2E baseline seeding is implemented in `tests/e2e/helpers/reset-e2e-user-state.ts`.
  - Helpers added and wired in `runE2EUserStateReset(...)`:
    - `resolveRequiredQuestionFixtures(...)`
    - `resolveRequiredChoiceFixtures(...)`
    - `seedDeterministicBaseline(...)`
    - `verifyDeterministicBaseline(...)`
  - Required failure codes are implemented:
    - `E2E_RESET:REQUIRED_QUESTION_FIXTURE_MISSING`
    - `E2E_RESET:CHOICE_FIXTURE_MISSING`
    - `E2E_RESET:BASELINE_STATE_INCOMPLETE`
  - Deterministic seed constants and row contract are implemented exactly:
    - fixed session/attempt UUIDs
    - fixed timestamps
    - one completed tutor session with 2-question `params_json`
    - one in-session correct attempt + one ad-hoc incorrect attempt
    - one bookmark row

- [x] Integration seed dependency now fails fast with explicit message in `tests/integration/tag-taxonomy-census.integration.test.ts`.
  - `beforeAll(...)` checks `tags` row count.
  - Exact error is implemented:
    - `[INTEGRATION_SEED_MISSING] tags table is empty. Run pnpm db:seed before pnpm test:integration.`

- [x] Playwright server mode is hardened in `playwright.config.ts`.
  - `webServer.command` is now `pnpm build && pnpm start`.
  - `webServer.reuseExistingServer` is now `false`.
  - Health URL remains `${baseURL}/api/health`.

- [x] Contract tests for this debt are present and passing:
  - `tests/e2e/helpers/reset-e2e-user-state.test.ts`
  - `playwright.config.test.ts`

## Implemented Resolution by Section

### §1 Schema-shape preflight

Already implemented under DEBT-243 and retained:

- `tests/e2e/helpers/credential-health-check.ts` validates `idempotency_keys.completed_at`.

### §2 Migrations before E2E in CI

Already implemented and retained:

- `.github/workflows/ci.yml` runs migration before E2E execution.

### §3 Deterministic E2E user state

Implemented in `tests/e2e/helpers/reset-e2e-user-state.ts`:

- setup order in `tests/e2e/global.setup.ts` remains:
  1. `runE2ECredentialHealthCheck()`
  2. `runE2EUserStateReset()`
  3. `clerkSetup()`
  4. `seedTestSubscription()`
- reset helper now clears mutable user state, resolves required published fixtures, resolves required choice fixtures, seeds deterministic baseline rows, and verifies post-seed invariants.

### §4 Repair stale references

No application read-path code changes were required. Root cause was state drift, not UI link rendering.

Confirmed defensive read paths remain in place:

- `src/application/use-cases/get-attempted-questions.ts`
- `src/application/use-cases/get-user-stats.ts`
- `src/application/use-cases/get-practice-session-review.ts`
- `src/application/shared/fetch-questions-by-id.ts`
- `src/application/shared/enrich-with-question.ts`

### §5 Stale assertions

No additional assertion rewrites were required under DEBT-244. Existing assertions are aligned with current component contracts.

### §6 Integration seed dependency

Implemented fail-fast seed precondition in:

- `tests/integration/tag-taxonomy-census.integration.test.ts`

### §7 Web server stability for Playwright

Implemented production-mode E2E server policy in:

- `playwright.config.ts`

## Final Outcome

The DEBT-244 reliability gaps are closed:

- E2E baseline state is deterministic and verified at setup.
- Missing integration seed state fails once with explicit remediation.
- E2E server mode uses production build/start to remove dev-server drift from long runs.

Remaining E2E governance and pyramid migration work continues in:

- `docs/debt/debt-245-e2e-pyramid-drift-and-skip-governance.md`
