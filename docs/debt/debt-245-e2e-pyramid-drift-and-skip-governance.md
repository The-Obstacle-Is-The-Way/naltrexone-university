# DEBT-245: E2E Pyramid Drift and Data-Dependent Skip Governance

**Status:** Active  
**Date:** 2026-02-23  
**Owner:** Test Infrastructure  
**GitHub Issue:** [#133](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/133)

## Problem

E2E currently mixes two different responsibilities:

1. critical end-to-end user journeys
2. component/token/DOM audit assertions

At the same time, E2E still contains 20 non-credential `test.skip(...)` call-sites that mask missing test data instead of failing fast.

## Verified Inventory

- E2E spec files: `20`
- Credential-gating skips (`test.skip(!hasClerkCredentials, ...)`): `16` call-sites across `15` files
- Non-credential skips: `20` call-sites across `6` files
- Deterministic baseline prerequisite (`B1-B7`): implemented via DEBT-244 resolution in `tests/e2e/helpers/reset-e2e-user-state.ts`

## Deterministic Preconditions for Skip Removal

### Baseline primitives (must exist before authenticated E2E specs run)

- `B1` Completed session row exists in History Sessions.
- `B2` Completed session has 2 reviewable question links in breakdown.
- `B3` At least one available attempted question row exists in History Questions.
- `B4` At least one available **Correct** attempted question row exists.
- `B5` At least one available **Incorrect** attempted question row exists.
- `B6` At least one available bookmark row exists.
- `B7` `anton-2006-combine-001` has per-choice explanations (for label-sync audit).

`B1-B6` are seeded by deterministic E2E setup (DEBT-244 §3). `B7` is a fixture integrity precondition.

### Complete non-credential skip table (all 20 call-sites)

| # | File | Line | Current skip reason | Baseline/data that removes skip |
|---|---|---:|---|---|
| 1 | `tests/e2e/bug-151-affordance-audit.spec.ts` | 210 | `No session rows to audit` | `B1` |
| 2 | `tests/e2e/bug-151-affordance-audit.spec.ts` | 273 | `No session rows to audit` | `B1` |
| 3 | `tests/e2e/bug-151-affordance-audit.spec.ts` | 322 | `No question cards to audit` | `B3` |
| 4 | `tests/e2e/bug-151-affordance-audit.spec.ts` | 403 | `No session breakdown to audit` | `B2` |
| 5 | `tests/e2e/bug-151-affordance-audit.spec.ts` | 460 | `No bookmark cards to audit` | `B6` |
| 6 | `tests/e2e/session-review-navigation.spec.ts` | 57 | `Session breakdown did not expose two reviewable items` | `B2` |
| 7 | `tests/e2e/session-review-navigation.spec.ts` | 82 | `Question navigator not rendered for this session review` | `B2` plus hard assertion on navigator render (not a skip) |
| 8 | `tests/e2e/session-review-navigation.spec.ts` | 228 | `No completed sessions available in history` | `B1` |
| 9 | `tests/e2e/session-review-navigation.spec.ts` | 294 | `No attempted questions in history to verify` | `B3` |
| 10 | `tests/e2e/bs-028-history-ux-audit.spec.ts` | 224 | `No attempted questions in history — cannot verify` | `B3` |
| 11 | `tests/e2e/bs-028-history-ux-audit.spec.ts` | 276 | `No sessions in history — cannot verify card affordances` | `B1` |
| 12 | `tests/e2e/bs-028-history-ux-audit.spec.ts` | 324 | `No sessions in history — cannot verify breakdown panel` | `B2` |
| 13 | `tests/e2e/bs-028-history-ux-audit.spec.ts` | 369 | `No sessions in history — cannot verify hover states` | `B1` |
| 14 | `tests/e2e/bs-028-history-ux-audit.spec.ts` | 470 | `No sessions in history — cannot verify back link` | `B2` |
| 15 | `tests/e2e/bs-028-history-ux-audit.spec.ts` | 633 | `No correct attempted questions in visible history page — cannot verify CTA label` | `B4` |
| 16 | `tests/e2e/bs-028-history-ux-audit.spec.ts` | 660 | `No incorrect attempted questions in visible history page — cannot verify CTA label` | `B5` |
| 17 | `tests/e2e/bs-028-history-ux-audit.spec.ts` | 740 | `No reviewable question rows in visible history page — cannot verify preview truncation` | `B3` |
| 18 | `tests/e2e/bs-019-action-bar-audit.spec.ts` | 285 | `No session with 2+ questions found — cannot test prev/next boundary` | `B2` |
| 19 | `tests/e2e/review-mode-audit.spec.ts` | 317 | `No bookmarks available to verify review-link contract` | `B6` |
| 20 | `tests/e2e/brainstorming-audit.spec.ts` | 152 | `Question has no choice explanations — cannot verify label sync` | `B7` |

## Definitive Resolution Plan

### 1) Enforce deterministic authenticated E2E setup

Use DEBT-244 §3 baseline seeding as a hard precondition for authenticated E2E. This prerequisite is complete.

### 2) Remove all 20 non-credential skips

For each row in the table above:

- delete `test.skip(...)`
- replace with a hard assertion and explicit failure message

Example replacement policy:

- from: `test.skip(true, 'No attempted questions in history to verify')`
- to: `expect(questionLink, '[E2E_BASELINE_MISSING] Expected at least one attempted question row').toBeVisible()`

### 3) Pyramid rebalancing for the 5 audit specs

#### `tests/e2e/bug-151-affordance-audit.spec.ts`

| Test | Target layer | Destination file | Action |
|---|---|---|---|
| Marketing feature cards misleading hover | Unit | `components/marketing/marketing-home.test.tsx` | Move assertion |
| Marketing impact stats no misleading hover | Unit | `components/marketing/marketing-home.test.tsx` | Move assertion |
| Marketing CTA styled (not bare link) | Unit | `components/marketing/marketing-home.test.tsx` | Move assertion |
| Dashboard stat/streak hover mismatch | Unit | `app/(app)/app/dashboard/page.test.tsx` | Move assertion |
| Dashboard recent links focus-ring classes | Unit | `app/(app)/app/dashboard/page.test.tsx` | Move assertion |
| Sessions row focus affordance classes | Unit | `app/(app)/app/history/components/history-sessions-tab.test.tsx` | Move assertion |
| Sessions row click navigation | Browser | `app/(app)/app/history/components/history-sessions-tab.browser.spec.tsx` | Move assertion |
| Questions card Pattern B structure | Unit | `app/(app)/app/history/components/history-questions-tab.test.tsx` | Move assertion |
| Session breakdown link focus-ring absence/presence contract | Unit | `app/(app)/app/shared/components/session-breakdown-list.test.tsx` | Move assertion |
| Bookmarks title-link focus-ring contract | Unit | `app/(app)/app/bookmarks/page.test.tsx` | Move assertion |
| Dark mode `--ring` token audit | Unit | `app/globals.css.test.ts` (new file) | Move assertion |
| Session summary hover token parity | Unit | `components/theme-token-regression.test.tsx` | Keep/update existing |
| Sessions vs Questions interaction asymmetry | Unit | `app/(app)/app/history/components/history-sessions-tab.test.tsx` + `app/(app)/app/history/components/history-questions-tab.test.tsx` | Split assertions |

Final state: delete `tests/e2e/bug-151-affordance-audit.spec.ts`.

#### `tests/e2e/bs-028-history-ux-audit.spec.ts` (including BS-027 block)

| Test | Target layer | Destination file | Action |
|---|---|---|---|
| P0-1 denominator uses `questionCount` | Unit | `app/(app)/app/history/components/history-sessions-tab.test.tsx` | Move assertion |
| P0-2 duration cap | Unit | `app/(app)/app/history/components/history-sessions-tab.test.tsx` | Keep/update existing |
| P1-3 Questions-tab review has navigator parity | E2E | `tests/e2e/session-review-navigation.spec.ts` | Consolidate there, remove duplicate |
| P1-4 session card clickable affordance | Browser | `app/(app)/app/history/components/history-sessions-tab.browser.spec.tsx` | Move assertion |
| P1-5 breakdown has “Review session” action | Browser | `app/(app)/app/history/components/history-sessions-tab.browser.spec.tsx` | Keep/update existing |
| P1-6 dark-mode hover contrast | Browser | `app/(app)/app/history/components/history-sessions-tab.browser.spec.tsx` | Move assertion |
| P2-8 sessions filters/pagination count text | Unit | `app/(app)/app/history/components/history-sessions-tab.test.tsx` | Move assertion |
| P2-9 single “Back to History” link | Unit | `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Keep/update existing |
| P2-14 no native `<select>` in filters | Unit | `app/(app)/app/history/components/history-questions-tab.test.tsx` | Keep/update existing |
| P3-10 no duplicate “Other” tag option | Unit | `app/(app)/app/history/components/history-questions-tab.test.tsx` | Move assertion |
| P3-11a correct history review CTA = Practice Again | Unit | `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Keep/update existing |
| P3-11b incorrect history review CTA = Try Again | Unit | `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Keep/update existing |
| P3-12 sort controls exist | Unit | `app/(app)/app/history/components/history-questions-tab.test.tsx` | Keep/update existing |
| P3-13 preview truncation/prefix contract | Unit | `app/(app)/app/history/components/history-questions-tab.test.tsx` | Keep/update existing |
| BS-027 tab-bar style consistency | Unit | `components/ui/tab-switch-styles.test.ts` + `app/(app)/app/history/components/history-tab-bar.test.tsx` | Move assertion |

Final state: delete `tests/e2e/bs-028-history-ux-audit.spec.ts`.

#### `tests/e2e/bs-019-action-bar-audit.spec.ts`

| Test | Target layer | Destination file | Action |
|---|---|---|---|
| Quick Practice action bar pre/post submit | Browser | `app/(app)/app/practice/quick/quick-practice-client.browser.spec.tsx` | Move assertion |
| Tutor session Q1/Q2 action bar states | Browser | `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx` | Move assertion |
| Exam session includes Mark for review | Browser | `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx` | Move assertion |
| History session review ordering/types/boundaries | Unit and Browser (split) | `app/(app)/app/questions/[slug]/question-page-client.test.tsx` and `app/(app)/app/questions/[slug]/components/review-question-navigator.test.tsx` | Split and move |

Final state: delete `tests/e2e/bs-019-action-bar-audit.spec.ts`.

#### `tests/e2e/bs-020-card-contrast-audit.spec.ts`

| Test | Target layer | Destination file | Action |
|---|---|---|---|
| Dark-mode CSS variable values | Unit | `app/globals.css.test.ts` (new file) | Move assertion |
| Dashboard page/card contrast contract | Unit | `components/theme-token-regression.test.tsx` | Move assertion |
| Landing page contrast contract | E2E (existing dedicated visual spec) | `tests/e2e/marketing-contrast.spec.ts` | Consolidate and delete duplicate |
| Session summary hover token parity | Unit | `components/theme-token-regression.test.tsx` | Keep/update existing |
| Hover pattern divergence tokens | Unit | `components/theme-token-regression.test.tsx` and `components/marketing/marketing-home.test.tsx` | Split assertions |

Final state: delete `tests/e2e/bs-020-card-contrast-audit.spec.ts`.

#### `tests/e2e/brainstorming-audit.spec.ts`

| Test | Target layer | Destination file | Action |
|---|---|---|---|
| BS-011 Bug B feedback label sync | Unit and Browser (split) | `src/application/shared/shuffled-choice-views.test.ts` and `app/(app)/app/questions/[slug]/question-page-client.browser.spec.tsx` (new file) | Split assertion |
| BS-012 Practice status filter exists | Unit | `app/(app)/app/practice/page.test.tsx` | Move assertion |
| BS-012 Quick Practice status filter exists | Unit | `app/(app)/app/practice/quick/quick-practice-client.test.tsx` | Keep/update existing |
| BS-011 Bug A history incorrect links include `mode=review` | Unit | `app/(app)/app/history/components/history-questions-tab.test.tsx` | Keep/update existing |

Final state: delete `tests/e2e/brainstorming-audit.spec.ts`.

### 4) Retained E2E scope after migration

Retain only journey specs in `tests/e2e/`:

- `smoke.spec.ts`
- `pricing-unauthenticated.spec.ts`
- `subscribe.spec.ts`
- `practice.spec.ts`
- `session-continuation.spec.ts`
- `bookmarks.spec.ts`
- `history.spec.ts`
- `cross-page-navigation.spec.ts`
- `subscribe-and-practice.spec.ts`
- `session-review-navigation.spec.ts`
- `review-mode-audit.spec.ts` (after removing remaining non-credential skip)
- `dark-mode.spec.ts`
- `theme-preference.spec.ts`
- `marketing-contrast.spec.ts`

### 5) CI guardrail for skip governance (exact implementation)

Add this step to `.github/workflows/ci.yml` in job `test`, immediately after `Lint and Format Check (Biome)` and before `Migrate DB`:

```yaml
- name: Enforce E2E skip policy
  run: |
    set -euo pipefail

    violations="$(rg "test\.skip\(" tests/e2e/*.spec.ts -n \
      | rg -v "test\.skip\(!hasClerkCredentials, 'Missing Clerk E2E credentials'\);")"

    if [ -n "$violations" ]; then
      echo "::error::Non-credential test.skip(...) is forbidden in tests/e2e/*.spec.ts"
      echo "$violations"
      exit 1
    fi
```

Policy is absolute: the only allowed E2E skip is the credential gate line.

## Execution Order (No Optionality)

1. Remove all 20 non-credential skips and replace with hard assertions.
2. Migrate/delete the 5 audit E2E specs exactly as mapped above.
3. Add the CI skip-policy guard.

## Verification Plan

1. `rg "test\.skip\(" tests/e2e/*.spec.ts -n` returns only the 16 credential-gate call-sites.
2. Full `pnpm test:e2e` run reports `0` non-credential skips.
3. CI fails if any `test.skip(true, ...)` is reintroduced in `tests/e2e/*.spec.ts`.
4. Coverage for removed audit specs is present in destination unit/browser files listed above.
