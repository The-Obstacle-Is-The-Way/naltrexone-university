# DEBT-225: Vitest Cold-Import Timeout Flakes

**Status:** Open
**Priority:** P2
**Date:** 2026-02-17
**Component:** Test Infrastructure

---

## Description

This debt tracks a deterministic test-infrastructure issue:

- Heavy dynamic imports are executed inside `it()` blocks
- Vitest default `testTimeout` is 5000ms
- First-test cold import cost can consume most/all of that budget

Historically this manifested as intermittent CI failures with `Error: Test timed out in 5000ms` on the first `it()` in a file, then passing on re-run.

The broader debt: **29 magic-number per-test timeout overrides** are scattered across **17 files** as local band-aids (`10_000`, `15_000`, `20_000`, `40000`) with no shared policy.

### Rebase Validation Snapshot (2026-02-17)

- Structural risk is still present (same inline import pattern, same default timeouts, same 29 overrides)
- Local reproduction did **not** fail in isolated runs after rebase:
  - 5 runs each for 3 high-risk files (15 runs total): all passed
  - 3 additional runs each with Vitest/Vite cache cleared (9 runs total): all passed

This means the debt remains valid as a reliability risk and policy inconsistency even when flakes are not reproduced on a single developer machine.

## Evidence (Current State)

### High-Risk Files (no per-test override, first `it()` imports heavy module graph)

| File | First Test | Import Pattern | Transitive Weight Snapshot |
|------|-----------|----------------|----------------------------|
| `lib/container-modules.test.ts:4` | "exposes modular container builders by bounded context" | `await Promise.all([4 container imports])` | Container graph + repositories + Drizzle + `db/schema.ts` (549 lines) |
| `app/(app)/app/practice/components/practice-view.test.tsx:12` | "renders Back to Dashboard link with correct href" | `await import('./practice-view')` | `practice-view.tsx` (319 lines) + `practice-page-logic.ts` (209 lines) + UI tree |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx:57` | "renders a Back to Dashboard utility link" | `await import('./question-page-client')` | `question-page-client.tsx` (331 lines) + `question-page-logic.ts` (259 lines) + route/controller utilities |

### Magic-Number Override Inventory (29 instances, 17 files)

Every override follows the same anti-pattern: `await import()` inside `it()` with an arbitrary timeout argument.

| Timeout | Count | Files |
|---------|-------|-------|
| `40000` | 4 | `lib/container.test.ts` |
| `15_000` | 2 | `components/marketing/marketing-home.test.tsx` (1), `components/ui/dropdown-menu.test.tsx` (1) |
| `20_000` | 13 | `lib/container.skip-clerk.test.ts` (2), `app/(app)/app/questions/[slug]/page.test.tsx` (6), `app/(app)/app/practice/page.test.tsx` (2), `app/(app)/app/practice/quick/page.test.tsx` (1), `app/(app)/app/practice/[sessionId]/page.test.tsx` (2) |
| `10_000` | 10 | `app/(app)/app/questions/[slug]/page.test.tsx` (1), `app/pricing/page.test.tsx` (1), `app/global-error.test.tsx` (1), `app/error.test.tsx` (1), `app/(app)/app/dashboard/error.test.tsx` (1), `app/(app)/app/layout-shell.test.tsx` (1), `app/(app)/app/billing/error.test.tsx` (1), `app/(app)/app/practice/quick/error.test.tsx` (1), `app/(app)/app/practice/[sessionId]/error.test.tsx` (1), `app/(app)/app/practice/error.test.tsx` (1) |

> Note: `app/(app)/app/questions/[slug]/page.test.tsx` contains both `20_000` and `10_000` overrides (7 total).

### Additional Exposure Surface

`await import(...)` inside test bodies appears in **54** `*.test.ts(x)` files total.

- Immediate fix scope in this debt: **20 files** (3 high-risk + 17 override files)
- Residual files: **34** (no timeout override today, lower observed risk, but same underlying pattern)

Residual files are not all required for this debt closure, but should be audited opportunistically to prevent future timeout drift.

### Audit Commands (repeatable)

```bash
# Count override instances (expect 29)
POS=$(rg -n "},\\s*(10_000|20_000|40000)\\)" --glob '*.test.ts' --glob '*.test.tsx' | wc -l)
OBJ=$(rg -n "\\{\\s*timeout:\\s*15_000\\s*\\}" components/marketing/marketing-home.test.tsx components/ui/dropdown-menu.test.tsx | wc -l)
echo "$((POS + OBJ))"

# Count files with overrides (expect 17)
{
  rg -n "},\\s*(10_000|20_000|40000)\\)" --glob '*.test.ts' --glob '*.test.tsx'
  rg -n "\\{\\s*timeout:\\s*15_000\\s*\\}" components/marketing/marketing-home.test.tsx components/ui/dropdown-menu.test.tsx
} | cut -d: -f1 | sort -u | wc -l

# Show override value distribution
{
  rg -n "},\\s*(10_000|20_000|40000)\\)" --glob '*.test.ts' --glob '*.test.tsx' \
    | grep -oE '(10_000|20_000|40000)\\)' | tr -d ')';
  rg -n "\\{\\s*timeout:\\s*15_000\\s*\\}" components/marketing/marketing-home.test.tsx components/ui/dropdown-menu.test.tsx \
    | grep -oE '15_000';
} | sort | uniq -c

# Confirm no explicit global timeout config yet
rg -n "testTimeout|hookTimeout" vitest.config.ts vitest.browser.config.ts vitest.integration.config.ts

# Count files using inline dynamic imports in tests (exposure surface)
rg -n "await import\\(" --glob '*.test.ts' --glob '*.test.tsx' | cut -d: -f1 | sort -u | wc -l
```

## Root Cause

### 1. No explicit global Vitest timeout policy

No `testTimeout` / `hookTimeout` is set in:

- `vitest.config.ts`
- `vitest.browser.config.ts`
- `vitest.integration.config.ts`

So all suites currently inherit Vitest defaults (`testTimeout=5000ms`, `hookTimeout=10000ms`).

### 2. Testing guidance emphasizes dynamic imports inside `it()`

Current guidance/examples enforce or imply inline dynamic import in test bodies:

- `.claude/rules/testing-react19.md`
- `docs/dev/react-vitest-testing.md` checklist

Dynamic imports are still the right mechanism for React 19 compatibility, but placing them inside `it()` charges cold-load cost against `testTimeout` instead of `hookTimeout`.

### Connection to DEBT-224

DEBT-224 tracks large files, which amplify cold-import cost. Current heavy inputs include:

- `db/schema.ts` (549 lines)
- `src/adapters/repositories/drizzle-attempt-repository.ts` (438 lines)
- `app/(app)/app/questions/[slug]/question-page-client.tsx` (331 lines)
- `app/(app)/app/practice/components/practice-view.tsx` (319 lines)

File-size reduction helps but does not replace timeout-policy cleanup.

### Community Context

- [Vitest issue #6441](https://github.com/vitest-dev/vitest/issues/6441) - cold-start module loading pain and cache discussion
- [Vitest timing breakdown](https://sordyl.dev/dev-bites/vitest-timing-breakdown/) - transform/setup often dominate elapsed time
- [Vitest discussion #7890](https://github.com/vitest-dev/vitest/discussions/7890) - recurring timeout-policy pain in real projects

## Impact

- Intermittent CI risk from cold-import budget overruns
- 29 undocumented magic-number overrides hide root cause
- Slower feedback loops from reruns/retries
- Inconsistent testing conventions across contributors
- Low trust in timeout failures ("flake fatigue")

## Resolution

### Part 1: Move shared imports from `it()` to `beforeAll()` where structurally valid

Target scope is **20 files total**:

- 3 high-risk files without overrides (table above)
- 17 files currently using magic-number overrides

Pattern:

```typescript
// BEFORE: import cost charged to testTimeout
it('renders x', async () => {
  const Component = (await import('./component')).default;
  // ...
}, 10_000);

// AFTER: import cost charged to hookTimeout
let Component: typeof import('./component')['default'];

beforeAll(async () => {
  Component = (await import('./component')).default;
});

it('renders x', () => {
  // ...
});
```

### Part 2: Define global timeout safety net (all Vitest configs)

Add explicit values (proposed baseline):

- `testTimeout: 10_000`
- `hookTimeout: 15_000`

Apply to:

- `vitest.config.ts`
- `vitest.browser.config.ts`
- `vitest.integration.config.ts`

If integration suite needs a different baseline, keep it explicit and document why.

### Part 3: Remove magic-number per-test timeout arguments

Delete all 29 overrides after Part 1 + Part 2.

### Part 4: Update testing guidance docs to avoid reintroduction

Update all relevant guidance, not only one file:

- `.claude/rules/testing-react19.md`
- `docs/dev/react-vitest-testing.md`
- `AGENTS.md` React 19 testing snippet/checklist (if wording still implies per-test inline import)

### Part 5: Add a lightweight guardrail

Add a CI or lint-script check to fail on new `it(..., <number>)` timeout arguments in `*.test.ts(x)` unless explicitly allowlisted.

## Exception: `lib/container.skip-clerk.test.ts`

This file uses per-test `vi.resetModules()` + `vi.doMock()` and intentionally re-imports `./container` after each mock setup.

- Preferred: move import into per-test `beforeEach` if feasible (still uses `hookTimeout`)
- If infeasible: keep timeout override with an explicit rationale comment and link to DEBT-225

## Discarded Alternatives

- Raise `testTimeout` only: safety net only, does not remove root cause
- Add more per-test overrides: extends existing anti-pattern
- Vite dev-server warmup tricks: not reliable for Vitest worker cold-import behavior
- Blind static top-level import conversion: riskier for mock-order semantics than `beforeAll` dynamic import

## Acceptance Criteria

- [ ] `vitest.config.ts`, `vitest.browser.config.ts`, and `vitest.integration.config.ts` define explicit `testTimeout` and `hookTimeout`
- [ ] All 20 scoped files are migrated to the `beforeAll` import pattern, except documented structural exceptions
- [ ] Override inventory returns 0 undocumented instances:
  - `rg -n "},\\s*(10_000|20_000|40000)\\)" --glob '*.test.ts' --glob '*.test.tsx'`
  - `rg -n "\\{\\s*timeout:\\s*15_000\\s*\\}" components/marketing/marketing-home.test.tsx components/ui/dropdown-menu.test.tsx`
- [ ] React 19 testing guidance updated consistently across `.claude/rules/testing-react19.md`, `docs/dev/react-vitest-testing.md`, and `AGENTS.md`
- [ ] `pnpm test --run` is stable across 5 consecutive runs on the fix branch
- [ ] No timeout-related rerun churn in the next 10 CI runs

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) - file size audit (upstream contributor to cold-import cost)
- [DEBT-204](../_archive/debt/debt-204-stripe-payment-gateway-test-god-file.md) - previous test-god-file cleanup
- [DEBT-110](../_archive/debt/debt-110-e2e-helper-anti-patterns.md) - related timeout-discipline theme in E2E
- [Vitest #6441](https://github.com/vitest-dev/vitest/issues/6441)
- [Vitest timing breakdown](https://sordyl.dev/dev-bites/vitest-timing-breakdown/)
- [Vitest #7890](https://github.com/vitest-dev/vitest/discussions/7890)
