# Server tracing boundary replacement — 2026-09-20

Base: main `86336194` (same tree as dev `bad0c71a`). Owner ruling:
typed wrapper plus Biome import restriction, retaining runtime filtering.
This is implementation evidence; review and promotion are still pending.

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
