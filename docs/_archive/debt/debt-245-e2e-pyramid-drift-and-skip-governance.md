# DEBT-245: E2E Pyramid Drift and Data-Dependent Skip Governance (Resolved)

**Status:** Resolved  
**Date:** 2026-02-23  
**Owner:** Test Infrastructure  
**GitHub Issue:** [#133](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/133)

## Verification Note (2026-02-23)

The DEBT-245 resolution was re-audited against live repository state. All scoped items are implemented.

- [x] All non-credential `test.skip(...)` call-sites were removed from `tests/e2e/*.spec.ts`.
- [x] Only credential-gating skip remains:
  - `test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');`
- [x] Five audit-heavy E2E specs were removed from Playwright scope:
  - `tests/e2e/bug-151-affordance-audit.spec.ts`
  - `tests/e2e/bs-028-history-ux-audit.spec.ts`
  - `tests/e2e/bs-019-action-bar-audit.spec.ts`
  - `tests/e2e/bs-020-card-contrast-audit.spec.ts`
  - `tests/e2e/brainstorming-audit.spec.ts`
- [x] Data-precondition checks now fail loudly with explicit assertion messages in retained E2E specs:
  - `tests/e2e/session-review-navigation.spec.ts`
  - `tests/e2e/review-mode-audit.spec.ts`
- [x] CI now enforces skip policy before DB migration:
  - `.github/workflows/ci.yml` includes `Enforce E2E skip policy`.

## Final Inventory (Post-Resolution)

- E2E spec files: `15`
- Credential-gating skip call-sites: `10`
- Non-credential skip call-sites: `0`

Current retained E2E specs:

- `tests/e2e/smoke.spec.ts`
- `tests/e2e/pricing-unauthenticated.spec.ts`
- `tests/e2e/subscribe.spec.ts`
- `tests/e2e/practice.spec.ts`
- `tests/e2e/session-continuation.spec.ts`
- `tests/e2e/bookmarks.spec.ts`
- `tests/e2e/history.spec.ts`
- `tests/e2e/core-app-pages.spec.ts`
- `tests/e2e/cross-page-navigation.spec.ts`
- `tests/e2e/subscribe-and-practice.spec.ts`
- `tests/e2e/session-review-navigation.spec.ts`
- `tests/e2e/review-mode-audit.spec.ts`
- `tests/e2e/dark-mode.spec.ts`
- `tests/e2e/theme-preference.spec.ts`
- `tests/e2e/marketing-contrast.spec.ts`

## Implemented Resolution

### 1) Deterministic preconditions + fail-loud policy in E2E

Non-credential skips were replaced with hard assertions using explicit failure messages:

- `[E2E_BASELINE_MISSING] Expected at least two reviewable session breakdown links.`
- `[E2E_BASELINE_MISSING] Expected at least one completed history session.`
- `[E2E_BASELINE_MISSING] Expected at least one attempted question in history.`
- `[E2E_BASELINE_MISSING] Expected at least one bookmark for review-mode audit.`

This keeps E2E honest: missing baseline/data now fails immediately instead of silently skipping.

### 2) Pyramid rebalancing

The five audit-focused E2E specs were removed from Playwright scope. Coverage now lives in lower layers and retained journey specs, including:

- `components/marketing/marketing-home.test.tsx`
- `components/theme-token-regression.test.tsx`
- `app/(app)/app/dashboard/page.test.tsx`
- `app/(app)/app/history/components/history-sessions-tab.test.tsx`
- `app/(app)/app/history/components/history-questions-tab.test.tsx`
- `app/(app)/app/shared/components/session-breakdown-list.test.tsx`
- `app/(app)/app/bookmarks/page.test.tsx`
- `app/(app)/app/questions/[slug]/question-page-client.test.tsx`
- `app/(app)/app/questions/[slug]/components/review-question-navigator.test.tsx`
- `app/(app)/app/practice/page.test.tsx`
- `app/(app)/app/practice/quick/quick-practice-client.test.tsx`
- `components/ui/tab-switch-styles.test.ts`
- `app/(app)/app/history/components/history-tab-bar.test.tsx`
- `src/application/shared/shuffled-choice-views.test.ts`

### 3) CI governance

`.github/workflows/ci.yml` now blocks non-credential skips in `tests/e2e/*.spec.ts`:

```yaml
- name: Enforce E2E skip policy
  run: |
    set -euo pipefail

    violations="$(rg "test\.skip\(" tests/e2e/*.spec.ts -n \
      | rg -v "test\.skip\(!hasClerkCredentials, 'Missing Clerk E2E credentials'\);" \
      || true)"

    if [ -n "$violations" ]; then
      echo "::error::Non-credential test.skip(...) is forbidden in tests/e2e/*.spec.ts"
      echo "$violations"
      exit 1
    fi
```

## Verification Commands

1. `rg "test\.skip\(" tests/e2e/*.spec.ts -n`  
   Expected: only credential-gating call-sites.
2. `pnpm test:e2e`  
   Expected: no non-credential skip behavior.
3. CI workflow run  
   Expected: guard fails if any non-credential `test.skip(...)` is introduced.

## Outcome

DEBT-245 is closed:

- E2E now focuses on user journeys.
- Skip governance is explicit and enforced in CI.
- Baseline/data drift now fails loudly instead of being hidden by body-level skips.
