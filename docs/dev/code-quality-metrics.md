# Code Quality Metrics (CRAP Analysis)

**Last Updated:** 2026-08-13

CRAP — **C**hange **R**isk **A**nti-**P**atterns (Alberto Savoia & Bob Evans, crap4j; originally expanded "Change Risk Analysis and Predictions" before the authors re-glossed it) — scores every function by combining the two numbers that are individually misleading but jointly decisive:

```
CRAP(f) = comp(f)² × (1 − cov(f))³ + comp(f)
```

where `comp` is the function's cyclomatic complexity and `cov` its test coverage as a fraction (statement coverage within the function's span, the practical proxy for basis-path coverage). The shape of the formula is the insight:

- **Fully covered** → the cubic term vanishes; CRAP = comp. Complexity alone never condemns a function — it just sets the floor.
- **Uncovered** → CRAP = comp² + comp. A complexity-5 function with full tests scores **5**; a complexity-30 function with none scores **930**.
- Convention: **CRAP > 30 = change-risky** ("crappy"); the fix is always one of two levers — *add tests* (raise cov) or *refactor* (lower comp). Which lever: consequential business logic gets tests first; incidental complexity (long parameter juggling, nested formatting) gets refactored first.

**Why this repo wants it:** coverage here is deliberately observational — no numeric gates (`docs/dev/react-vitest-testing.md`). CRAP fits that culture exactly: it is a **ranked triage list**, not a threshold. It also completes the loop with mutation testing (`docs/dev/mutation-testing.md`): CRAP scans the whole tree cheaply to find *under-tested complexity*; mutation testing then verifies deeply, on the modules you choose, that the tests you add actually bite. CRAP ranks → you test or refactor → Stryker audits the result. Proposed by `docs/adr/adr-019-test-quality-practices.md`; tracked as DEBT-465 Part 1.

---

## 1. Implementation: `scripts/crap-report.ts`

No off-the-shelf TS tool computes CRAP worth adopting; the repo builds a small reporter, in its established custom-script style, from parts it already has:

- **Coverage input** — the istanbul-format `coverage-final.json` files the existing lanes already emit (`@vitest/coverage-v8` remaps V8 output to istanbul format: per-file `statementMap`/`s` and `fnMap`/`f`):
  - unit → `coverage/coverage-final.json` (`pnpm test:coverage`)
  - browser → `coverage/browser/coverage-final.json` (`pnpm test:browser:coverage`)
  - integration → `coverage/integration/coverage-final.json` (`pnpm test:integration:coverage`)
- **Complexity** — the TypeScript compiler API, which is already a direct dependency and already used for source analysis in `tests/server-span-family-boundary.test.ts`; file discovery via `fast-glob` (also present) or the coverage keys themselves.
- **Merging** — the three lanes cover different code (UI components are pinned in the browser lane, Drizzle repositories in integration). The default report **merges whichever `coverage-final.json` files exist**, so "covered" means *any automated test exercises this*; `--lane unit` narrows when you want lane-specific truth. Merge with `istanbul-lib-coverage`'s `createCoverageMap().merge()` — add it as an explicit devDependency in the implementing PR (it already ships transitively with the coverage provider; pnpm's isolated `node_modules` means we declare it to import it).

### Mechanics

1. Load and merge the coverage maps.
2. For each covered source file (filtered to `src/**`, `app/**`, `components/**`, `lib/**`; excluded: `**/test-helpers/**`, `*.test.*`, `*.browser.spec.*`, `db/migrations`), parse with `ts.createSourceFile` and walk function-like declarations (function/method/arrow/accessor).
3. Cyclomatic complexity per function = 1 + decision points: `if`, `for`/`for-of`/`for-in`, `while`, `do`, `case` clause, `catch`, ternary, `&&`, `||`, `??`, and the logical-assignment forms `&&=`/`||=`/`??=` (`??=` is live in production adapters).
4. Per-function coverage = executed ÷ total statements whose position falls inside the function's span (from `statementMap`/`s`); functions absent from coverage entirely count as `cov = 0`.
5. Emit a table sorted by CRAP descending — `path:line · function · comp · cov% · CRAP` — with `--top N` (default 25), `--json` for tooling, `--min <score>` to filter. **Exit code is always 0**: the report is observational by policy.

Reference core of the complexity walker (the implementing PR builds the real script TDD-first, with a colocated `crap-report.test.ts` over a fixture source file + fixture coverage JSON, like the 17 existing script tests):

```ts
import ts from 'typescript';

const DECISION_KINDS = new Set([
  ts.SyntaxKind.IfStatement, ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForInStatement, ts.SyntaxKind.WhileStatement, ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause, ts.SyntaxKind.CatchClause, ts.SyntaxKind.ConditionalExpression,
]);
const DECISION_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

function cyclomatic(fn: ts.Node): number {
  let complexity = 1;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) && node !== fn) return; // nested functions scored separately
    if (DECISION_KINDS.has(node.kind)) complexity += 1;
    if (ts.isBinaryExpression(node) && DECISION_OPERATORS.has(node.operatorToken.kind)) complexity += 1;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  return complexity;
}
```

### Running

```bash
pnpm test:coverage                        # at minimum; browser/integration lanes optional
pnpm exec tsx scripts/crap-report.ts --top 25
```

Add `"quality:crap": "tsx scripts/crap-report.ts"` to `package.json` in the implementing PR.

## 2. Interpretation policy

- **Observational, always.** Bands for triage: CRAP > 30 → look; > 100 → hotspot; > 300 → the next refactor/test wave starts here. No CI gate, no threshold in config — a gate would require an ADR amending ADR-019, per the standing coverage policy.
- Read merged-lane by default. A repository that scores high on `--lane unit` but low merged is *lane-appropriate* (pinned by integration), not neglected — that distinction is the point of the merge flag.
- Pure DI wiring (`lib/container/*.ts`) scores low on comp and is still untested — CRAP won't flag it, and that's correct; its risk (swapped compatible constructor args) is covered by integration/E2E, not unit assertions.
- Cadence: run before any refactor wave and roughly monthly; snapshot the top-25 into DEBT-465's verification log so movement is visible. Not a per-PR step.

## 3. A-priori hotspots (2026-08-13 audit — verify with the first real report)

Ranked candidates from the manual sweep (branch density × size ÷ colocated tests), before the script exists. The pre-commit size gate's exemption list in `scripts/check-file-size.sh` (14 legacy files over 350 lines) is an independent shortlist that substantially overlaps.

| Candidate | Signal |
|---|---|
| `src/adapters/repositories/drizzle-renewal-notice-delivery-repository.ts` | 399 loc, claim/dispatch/requeue state machine for legally-required notices, **zero unit-lane tests** (integration only) — worst absolute gap in `src/` |
| `src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository.ts` | 5-status operation machine (pending/processing/completed/terminal/expired), 5 tests |
| `src/adapters/gateways/clerk-user-provisioner.ts` | 11 distinct resolution outcomes (9 `blocked_*` paths), 8 tests; failure mode is account-takeover-adjacent |
| `app/(marketing)/checkout/success/checkout-success-sync.tsx` | Post-payment reconciliation — "paid but locked out" is the worst support ticket; the 344-loc component has no component-level test: only the extracted version fence (3 colocated tests) and the page shell are pinned directly |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.ts` | Among the densest-branching practice hooks (exam results after refresh/reconnect) — state that only goes wrong in the field |
| `app/(app)/app/questions/[slug]/hooks/use-question-page-bookmarks.ts` | Lowest direct spec-to-hook ratio of the question-page hooks (174-line spec on a 227-line hook; peers run ~1.0–2.2×) |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | 2nd-highest branch density in the repo; stateful fan-out over review/origin/navigation/bookmark/feedback |
| `app/(app)/app/history/components/history-questions-tab.tsx` | Second-largest React component (574 loc, behind `practice-view.tsx` at 584) carrying 2 colocated test files to practice-view's 10 |
| `src/adapters/gateways/stripe/stripe-checkout-sessions.ts` | Highest branch count in the repo (986 loc); well-tested absolutely but a complexity concentration — a *refactor-lever* candidate, not a test-lever one |
| `src/application/use-cases/get-user-stats.ts` | The dashboard's entire numeric surface on 4 tests |
| `src/application/use-cases/get-completed-session-questions-with-feedback.ts`, `get-practice-session-review.ts` | Read-model projections with fallback branches, ~9 tests each |
| `src/adapters/repositories/drizzle-question-repository.ts` | Owns the progress-status filter SQL deciding which questions a session may contain |

## 4. Relationship to the complexity linter

Biome 2.5 ships `noExcessiveCognitiveComplexity` (unconfigured here). Cognitive complexity is a different metric — it penalizes *nesting and reading effort*, not path count — so it complements rather than replaces CRAP's `comp`. Option for the implementation wave: enable it at `"warn"` with a generous threshold as an authoring-time nudge. Keep it advisory; the ranked CRAP report, not a lint error, is where test-or-refactor decisions get made.

## 5. Adoption sequence (DEBT-465 Part 1)

1. TDD `scripts/crap-report.ts` (fixture source + fixture coverage JSON → known scores; the formula's boundary cases — cov 0, cov 1, nested functions — are the unit tests).
2. Add the `quality:crap` script + `istanbul-lib-coverage` devDep; `.gitignore` already covers `coverage/`.
3. Produce the baseline: run all three coverage lanes, then the merged report; record the top-25 in DEBT-465.
4. Compare against the table above; correct this doc where the measured ranking disagrees with the manual sweep.
5. Feed results forward: top *test-lever* items become mutation-pilot wave 2 candidates after their tests land; top *refactor-lever* items become owner-scheduled refactor filings.
