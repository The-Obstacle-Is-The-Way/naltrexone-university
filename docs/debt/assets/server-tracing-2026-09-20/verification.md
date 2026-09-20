# Server tracing boundary replacement — 2026-09-20

Base: main `86336194` (same tree as dev `bad0c71a`). Owner ruling:
typed wrapper plus Biome import restriction, retaining runtime filtering.
This initial implementation evidence precedes the reviewed promotion recorded below.

## Replacement-before-deletion proofs

- The initial wrapper tests failed because the wrapper did not exist.
- Real-file lint fixtures with the restriction disabled: 1 failed / 5 passed.
  The failed case was a direct SDK import in a controller. The five permitted
  paths are the wrapper, instrumentation, client configuration, client-error
  reporter, and browser-test setup. Restoring the restriction passes all six.
- Widening the family and fields parameters: `pnpm typecheck` exits 1 at all
  three type contracts (unknown family, unknown field, invalid count shape).
  Restoring the narrow types passes. Vitest alone does not enforce these types.
- Removing initial and later runtime projection: 3 failed / 13 passed, exposing
  private fields and invalid numeric values. Restoring projection passes 16/16.
- The unchanged projector's three existing cases still pass, including hostile
  accessors and invalid identity/value shapes.
- Six literal metadata cases preserve the existing names, operations and fixed
  attributes. A one-off AST comparison against the base confirmed each caller's
  family selection and callback are identical after removing the now-centralized
  projector calls. No comparison scanner is added to the repository.
- The restored wrapper/import/projector and affected controller, normalizer and
  container suites pass **9 files / 112 cases**. Typecheck and lint pass; the
  fidelity scanner reports zero issues. No floor or test-size policy changes.

The deleted scanner had three tests and 469 lines. Its exact-file/site census
is intentionally retired under the owner ruling; registered metadata, typed
fields, import ownership, and runtime filtering are the replacement properties.
No claim is made about Sentry transport delivery or adversarial import evasion.

The full unit run after replacement passed **463 files / 4,280 cases** in
28.34 seconds (one measurement, not a benchmark claim). Against the promoted
base's 462 / 4,261, the exact delta is three scanner cases removed and 22
wrapper/import cases added; the original three projector cases remain.
The six touched debt/receipt documents resolve 560 relative file destinations
with zero missing targets; the register has exactly one Latest stanza.

Sanitized local logs: `/private/tmp/codex-server-tracing.vuffa3/`
(`real-file-lint-red.log`, `type-red.log`, `filter-red.log`, `focused-green.log`).
The earlier stdin-lint experiments were harness failures and are **not** counted
as product red proofs: Biome's stdin mode did not emit the required diagnostics.

## Reviewed promotion

Source #929 was approved on exact head `d258a732` and merged as `32bcdd93`.
The requested generalized Sentry-client injection was rejected with the explicit
typed-boundary ruling and runtime/type/lint receipts; CodeRabbit withdrew the
finding and approved. No wider abstraction was added.

Promotion #930 was approved on exact head `32bcdd93` with zero unresolved
threads and merged as `f8300d25`. Its pre-merge setup recovery was explicitly
adjudicated by the owner; see the [retry-policy evidence](../e2e-retries-2026-09-20/verification.md).
Post-merge main CI **35511099388** passed 4,280 unit, 411 browser, 293 integration
(six opt-in skips), and **44/44 E2E without failed attempts or retries**.

The production build was Ready at **12:37:45.083Z** but observed Staged with the
old alias through **12:46:30Z**. GitHub `test` passed at **12:46:40Z**; Vercel's
native check succeeded **12:46:42.011Z**, then www was assigned **12:46:42.170Z**
and apex **12:46:42.175Z**. Both serve `f8300d25`; home and health returned 200.
Dev/main share tree `89861133ee00f04221f5cdf493b38dcb0dccca0a`.
See [the promotion closeout](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/930#issuecomment-5749896625).
