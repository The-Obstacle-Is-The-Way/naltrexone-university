# Code Quality Metrics (CRAP Analysis)

**Last Updated:** 2026-08-22

CRAP — **C**hange **R**isk **A**nti-**P**atterns (Alberto Savoia & Bob Evans, crap4j; originally expanded "Change Risk Analysis and Predictions" before the authors re-glossed it) — scores every function by combining the two numbers that are individually misleading but jointly decisive:

```text
CRAP(f) = comp(f)² × (1 − cov(f))³ + comp(f)
```

where `comp` is the function's cyclomatic complexity and `cov` its test coverage as a fraction (statement coverage within the function's span; the original CRAP definition uses basis-path coverage — this report substitutes statement coverage as its measurable stand-in). The shape of the formula is the insight:

- **Fully covered** → the cubic term vanishes; CRAP = comp. Complexity remains the floor, so a sufficiently complex function can still cross the triage band.
- **Uncovered** → CRAP = comp² + comp. A complexity-5 function with full tests scores **5**; a complexity-30 function with none scores **930**.
- Convention: **CRAP ≥ 30 = change-risky** ("crappy"); the fix is always one of two levers — *add tests* (raise cov) or *refactor* (lower comp). Which lever: consequential business logic gets tests first; incidental complexity (long parameter juggling, nested formatting) gets refactored first.

**Why this repo wants it:** coverage here is deliberately observational — no numeric gates (`docs/dev/react-vitest-testing.md`). CRAP fits that culture exactly: it is a **ranked triage list**, not a threshold. It also completes the loop with mutation testing (`docs/dev/mutation-testing.md`): CRAP scans the whole tree cheaply to find *under-tested complexity*; mutation testing then verifies deeply, on the modules you choose, that the tests you add actually bite. CRAP ranks → you test or refactor → Stryker audits the result. Proposed by `docs/adr/adr-019-test-quality-practices.md`; tracked as DEBT-465 Part 1.

---

## 1. Implementation: `scripts/crap-report.ts`

The implementation builds a small repo-owned reporter, in the repo's established custom-script style, so its lane merge, source filters, and observational CLI contract stay explicit. The inputs and dependency topology below were execution-audited on 2026-08-22 against `dev` at `51114a76`:

- **Coverage input** — the istanbul-format `coverage-final.json` files the existing Vitest lanes emit (`@vitest/coverage-v8` remaps V8 output to istanbul format: per-file `statementMap`/`s` and `fnMap`/`f`):
  - unit → `coverage/coverage-final.json` (`pnpm test:coverage`)
  - browser → `coverage/browser/coverage-final.json` (`pnpm test:browser:coverage`)
  - integration → `coverage/integration/coverage-final.json` (`pnpm test:integration:coverage`)
- **No Playwright input** — `.github/workflows/ci.yml` uploads coverage before `pnpm test:e2e`, and Playwright has no coverage provider or `coverage-final.json` output. E2E may prove behavior but cannot contribute to this Istanbul merge.
- **Complexity** — import the classic TypeScript compiler API from `typescript`. Under the DEBT-460 seam, that package name resolves to the direct `@typescript/typescript6@6.0.2` alias (compiler API version 6.0.3), where `createSourceFile` and `forEachChild` are available. `@typescript/native` is the separate TypeScript 7.0.2 `tsc` implementation and exposes no supported classic compiler API. Discover sources with the direct `fast-glob@3.3.3` dependency, not coverage keys, because a production file absent from every map still needs `cov = 0` scores.
- **Merging** — the three lanes cover different code (UI hooks/components are browser-owned; Drizzle repositories gain integration coverage). The default report requires and merges **all three** maps before scoring. A missing map is an infrastructure failure, not permission to publish a partial baseline. `--lane unit`, `--lane browser`, and `--lane integration` intentionally produce diagnostic single-lane truth and require only the selected map. Merge with `istanbul-lib-coverage`'s `createCoverageMap().merge()`. Version 3.2.2 is transitive in the lockfile but is not importable from the project root under pnpm's dependency isolation, so the implementation must add it and `@types/istanbul-lib-coverage` as explicit devDependencies.

`codecov.yml` now ignores `tests/e2e` because Playwright cannot add coverage for those helpers after Codecov's upload; treating E2E-only infrastructure as patch-coverage product code would be a false signal. CRAP answers a different question: it ranks production-function change risk. Its discovery roots exclude **all** tests and test support, not only `tests/e2e`; coverage-map entries for test code are therefore ignored even when a Vitest lane imported them. The policies agree that tests are not product candidates without making Codecov's narrow ignore list the CRAP source filter.

### Mechanics

1. Resolve the selected lane set, require every selected map, validate its shape, and merge it. Coverage keys are absolute on the audited outputs; normalize discovered source paths to absolute paths before lookup and ignore non-file sentinels such as the browser map's empty repository-root entry.
2. Discover `*.ts`/`*.tsx` production sources under `src/**`, `app/**`, `components/**`, and `lib/**`, plus the runtime/build entry points `db/schema.ts`, `instrumentation-client.ts`, `instrumentation.ts`, `next.config.ts`, `proxy.ts`, and `sentry.client.config.ts`. Exclude `**/*.d.ts`, `**/test-helpers/**`, `**/*-test-helpers.*`, `**/*.test.*`, `**/*.browser.spec.*`, `**/*.fixtures.*`, `**/*.browser.probes.*`, and `**/*.browser.setup.*`. Parse with `ts.createSourceFile`, reject any `parseDiagnostics`, and walk every executable function-like node with a body: declarations, expressions, methods, constructors, arrows, and accessors.
3. Cyclomatic complexity per function = 1 + decision points: `if`, `for`/`for-of`/`for-in`, `while`, `do`, `case` clause, `catch`, ternary, `&&`, `||`, `??`, and the logical-assignment forms `&&=`/`||=`/`??=` (`??=` is live in production adapters).
4. Assign each coverage statement by its start position to the innermost executable function span, so a nested function's statements are not also charged to its parent. Per-function coverage = executed ÷ total assigned statements (from `statementMap`/`s`); a function with no assigned statements, including one in a file absent from the coverage map, has `cov = 0`.
5. Emit a table sorted deterministically by CRAP descending, then path, line, and function name — `path:line · function · comp · cov% · CRAP` — with `--top N` (default 25), `--json` for tooling, `--min <score>` to filter, and `--lane <merged|unit|browser|integration>` (default `merged`).
6. **Exit 0 for every score, band, and empty filtered result.** Nonzero is reserved for a genuine infrastructure failure: a required coverage input is missing/unreadable/malformed, source parsing reports diagnostics, I/O fails, or CLI configuration is invalid. This distinguishes “the metric is high” from “no trustworthy report was produced” and is the ADR-019 contract.

Reference core of the complexity walker (the implementation is TDD-first, with a colocated `crap-report.test.ts` over fixture source and coverage, matching the repository's 20 existing script-test suites). The decision tests must separately pin `&&`, `||`, `??`, `&&=`, `||=`, and `??=` so assignment operators cannot silently fall through the binary-expression walker:

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
pnpm test:coverage
pnpm test:integration:coverage
pnpm test:browser:coverage
pnpm quality:crap --top 25
```

The three coverage commands must come from the same working tree before recording a baseline. Use an explicit diagnostic such as `pnpm quality:crap --lane unit --top 25` only when investigating lane ownership; never record it as the merged baseline. Add `"quality:crap": "tsx scripts/crap-report.ts"` to `package.json` in the implementing PR.

## 2. Interpretation policy

- **Observational, always.** Bands for triage: CRAP ≥ 30 → look; > 100 → hotspot; > 300 → the next refactor/test wave starts here. No CI gate, no threshold in config — a gate would require an ADR amending ADR-019, per the standing coverage policy.
- Read merged-lane by default. A function whose **CRAP score** is high under `--lane unit` but low under the merged lane is *lane-appropriate* — its coverage lives in the browser/integration lanes — not neglected; that distinction is the point of the merge flag. (High score = high risk: score falls as coverage rises.)
- Pure DI wiring (`lib/container/*.ts`) scores low on comp even if it is uncovered, so CRAP will not prioritize it; this repo separately pins those modules and transaction boundaries with unit and integration tests.
- Cadence: run before any refactor wave and roughly monthly; snapshot the top-25 into DEBT-465's verification log so movement is visible. Not a per-PR step.

## 3. A-priori hotspots (2026-08-13 audit; facts revalidated 2026-08-22)

Candidates from the manual sweep of decision density, size, direct tests, and consequence, before the script exists. These are **not** a measured ranking. The current factual receipts below were corrected before implementation; rank reconciliation waits for the first real merged report. The pre-commit size check's exemption list in `scripts/check-file-size.sh` still contains 14 legacy files over 350 lines; three candidates below appear on it.

| Candidate | Signal |
|---|---|
| `src/adapters/repositories/drizzle-renewal-notice-delivery-repository.ts` | 399 loc, claim/dispatch/requeue state machine for legally-required notices, **zero direct repository unit tests**; its behavior is covered in integration — a large direct-unit-test gap in `src/` |
| `src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository.ts` | 5-status operation machine (pending/processing/completed/terminal/expired), 5 tests |
| `src/adapters/gateways/clerk-user-provisioner.ts` | 11 distinct resolution outcomes (9 `blocked_*` paths), 8 tests; it fails closed around cross-account email ownership conflicts |
| `app/(marketing)/checkout/success/checkout-success-sync.tsx` | Post-payment reconciliation; failures can leave a paid user without access. The 344-loc sync module is exercised directly by 28 page/assertion tests plus 3 version-fence tests |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.ts` | 253-line refresh/reconnect continuity hook with 5 unit and 4 browser cases; the report must establish whether its branching actually ranks |
| `app/(app)/app/questions/[slug]/hooks/use-question-page-bookmarks.ts` | 227-line hook with a 174-line direct browser spec (4 cases); measurement must replace the old cross-hook ratio guess |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | 557-line stateful fan-out over review/origin/navigation/bookmark/feedback with 47 direct render-output cases; the old manual decision rank is not retained as fact |
| `app/(app)/app/history/components/history-questions-tab.tsx` | Second-largest React component (574 loc, behind `practice-view.tsx` at 584) carrying 2 colocated test files to practice-view's 10 |
| `src/adapters/gateways/stripe/stripe-checkout-sessions.ts` | 1,189-line Checkout orchestration module with 10 direct adapter test files; likely a *refactor-lever* candidate, but the report must establish its measured function ranks |
| `src/application/use-cases/get-user-stats.ts` | The dashboard's five top-level progress metrics on 4 tests |
| `src/application/use-cases/get-completed-session-questions-with-feedback.ts`, `get-practice-session-review.ts` | Read-model projections with fallback branches, 8 and 9 direct tests respectively |
| `src/adapters/repositories/drizzle-question-repository.ts` | Owns the progress-status filter SQL deciding which questions a session may contain; 16 direct unit cases plus integration coverage |

## 4. Relationship to the complexity linter

The installed Biome 2.5.7 ships `noExcessiveCognitiveComplexity` (not enabled in `biome.json`). Cognitive complexity is a different metric — it penalizes *nesting and reading effort*, not path count — so it complements rather than replaces CRAP's `comp`. Both lint scripts now use `--error-on-warnings`, so enabling this rule even at `"warn"` would create a numeric gate. It is out of scope for DEBT-465 Part 1 and requires the new ADR that ADR-019 mandates; the ranked CRAP report remains the observational test-or-refactor input.

## 5. Adoption sequence (DEBT-465 Part 1)

1. TDD `scripts/crap-report.ts` (fixture source + fixture coverage JSON → known scores; formula boundaries, nested functions, all six logical decision operators, lane merge, and infrastructure exits are unit contracts).
2. Add the `quality:crap` script plus direct `istanbul-lib-coverage` and `@types/istanbul-lib-coverage` devDependencies; `.gitignore` already covers `coverage/`.
3. Produce the baseline: run all three coverage lanes, then the merged report; record the top-25 in DEBT-465.
4. Compare against the table above; correct this doc where the measured ranking disagrees with the manual sweep.
5. Feed results forward: top *test-lever* items become mutation-pilot wave 2 candidates after their tests land; top *refactor-lever* items become owner-scheduled refactor filings.
