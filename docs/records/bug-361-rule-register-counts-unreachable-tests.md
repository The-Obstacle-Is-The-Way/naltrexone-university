# BUG-361: The Rule Register Counts Unreachable Test Declarations

**Status:** Verifying — promotion to main; due 2026-10-23
**Priority:** P3
**Date:** 2026-10-18

---

The Summary, Evidence and Impact describe audit baseline `0680cb2d`, before this fix; Resolution describes the implementation in this PR.

## Summary

The business-rule register accepts a named test inside an uncalled function, a `while (false)` body, code after a `return`, or an empty `.each` table as a proving test. None of these declarations executes. Many current proofs are `.each` titles over literal tables (for example R23's `%i` titles), so emptying such a table is one way an existing declaration could become unreachable. No current registered proof using these shapes was identified; this is a reproduced guard gap, not evidence that an existing product rule lacks coverage.

## Evidence

- `scripts/rule-to-test-register.ts:110-113` assumes loop bodies run; `:135` describes the returned titles as tests that would run unconditionally. The recursive visitor (`:149-171`) does not exclude uncalled function bodies or loops.
- Run from the repository root (no infrastructure):

  ```bash
  pnpm exec tsx -e 'import {declaredTestTitles} from "./scripts/rule-to-test-register.ts"; for (const s of ["function unused() { test(\"unrun proof\", () => {}); }", "while(false) { test(\"unrun proof\", () => {}); }"]) console.log([...declaredTestTitles(s,"proof.test.ts")]);'
  ```

  Both inputs return `[ 'unrun proof' ]`; the command exits 0. They register no tests when evaluated as JavaScript.
- The same call returns the title for `describe("s", () => { return; test("after return", () => {}); })` and for `test.each([])("empty each %s", () => {})`; Vitest registers neither.

Corrected 2026-10-19: add code after `return` and an empty `.each` table; describe all four shapes without an unmeasured likelihood claim.

## Impact

A future register entry can pass this static check after its proving test becomes unreachable. The ordinary test runner may still pass if other tests in that file run. This does not establish an execution failure in today's registered tests.

## Options

1. Tighten source reachability checks, with explicit support and proof for invoked shared contract factories. The live register includes titles inside exported factories in `tests/shared/question-availability-contract.ts` and `tests/shared/attempt-score-contract.ts`; rejecting every function body would break valid proofs. A larger static model still cannot prove arbitrary JavaScript execution.
2. Compare the register against executed test results across unit, browser and integration lanes, including the shared contract factories' generated titles. Fail closed on missing in-memory modules or results, skipped proofs and ambiguous title mappings. Recommended for execution proof, after specifying those mappings; retain source checks for quick feedback.

Corrected 2026-10-20: option 2 said "missing reports"; it now says "missing in-memory modules or results", because the reporter reads Vitest's in-memory results and writes no report file.

## Resolution

Implemented option 2 with an in-memory reporter per required lane, avoiding persisted reports and stale-result reuse. Each lane assigns proofs before inspecting results, rejects missing/ambiguous/nonpassing results and incomplete runs, and requires all generated cases for a parameterized proof. Literal metadata identifies parameterized and shared declarations; repository JS/TS annotation ownership and direct ordinary-test declaration locations prevent imported helpers from impersonating proofs. The two shared factories require their unit and integration consumers independently. Explicit focused/watch/sharded runs cannot issue a full-lane receipt; hidden configuration filters fail canonical runs. All three configurations include the reporter and prohibit `.only`; source checks remain bounded declaration checks. R2’s two ambiguous entries now name all six controller operations separately. R11’s hosted-portal scenario is supplemental; required entitlement and renewal-notice proofs remain in the three-lane gate.

Corrected 2026-10-19: bind reproduction claims to the audited baseline and record the red-first implementation, passing local gate and remaining final-sync verification.

## Verification

- [x] An uncalled function, a zero-iteration loop, code after a `return` and an empty `.each` table cannot satisfy a proving-test entry.
- [x] Supported module and suite declarations still pass; existing skip and conditional controls remain effective.
- [x] Check the live register and run its proving suites after the fix: the unit, browser and integration reporters each issued a passing full-lane receipt.

## Related

- DEBT-532: the scripts audit that found this.

Corrected 2026-10-19: record the three passing local full-lane execution receipts; coordinated E2E, review, CI and promotion remain pending.
