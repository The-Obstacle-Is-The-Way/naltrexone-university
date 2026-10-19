# BUG-361: The Rule Register Counts Unreachable Test Declarations

**Status:** Open — specify the executed-result mapping, then fix red first
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

The business-rule register accepts a named test inside an uncalled function or a `while (false)` body as a proving test. Neither declaration executes. No current registered proof using either shape was identified; this is a reproduced guard gap, not evidence that an existing product rule lacks coverage.

## Evidence

- `scripts/rule-to-test-register.ts:110-113` assumes loop bodies run; `:135` describes the returned titles as tests that would run unconditionally. The recursive visitor (`:149-171`) does not exclude uncalled function bodies or loops.
- Run from the repository root (no infrastructure):

  ```bash
  pnpm exec tsx -e 'import {declaredTestTitles} from "./scripts/rule-to-test-register.ts"; for (const s of ["function unused() { test(\"unrun proof\", () => {}); }", "while(false) { test(\"unrun proof\", () => {}); }"]) console.log([...declaredTestTitles(s,"proof.test.ts")]);'
  ```

  Both inputs return `[ 'unrun proof' ]`; the command exits 0. They register no tests when evaluated as JavaScript.

## Impact

A future register entry can pass this static check after its proving test becomes unreachable. The ordinary test runner may still pass if other tests in that file run. This does not establish an execution failure in today's registered tests.

## Options

1. Tighten source reachability checks, with explicit support and proof for invoked shared contract factories. The live register includes titles inside exported factories in `tests/shared/question-availability-contract.ts` and `tests/shared/attempt-score-contract.ts`; rejecting every function body would break valid proofs. A larger static model still cannot prove arbitrary JavaScript execution.
2. Compare the register against executed test results across unit, browser and integration lanes, including the shared contract factories' generated titles. Fail closed on missing reports, skipped proofs and ambiguous title mappings. Recommended for execution proof, after specifying those mappings; retain source checks for quick feedback.

## Resolution (proposed)

Specify option 2's mapping and report contract before implementation, red first. Keep source-scanning documentation bounded to declaration checks. If option 1 is chosen as an interim repair, preserve the invoked shared contracts with positive controls and do not claim general execution proof.

## Verification

- [ ] An uncalled function and a zero-iteration loop cannot satisfy a proving-test entry.
- [ ] Supported module and suite declarations still pass; existing skip and conditional controls remain effective.
- [ ] Check the live register and run its proving suites after the fix.

## Related

- DEBT-532: the scripts audit that found this.
