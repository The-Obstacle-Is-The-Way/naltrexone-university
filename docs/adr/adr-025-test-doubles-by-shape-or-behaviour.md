# ADR-025: Test Doubles by Shape or Behaviour

**Status:** Accepted
**Date:** 2026-10-11, recording decisions of 2026-08-22 to 2026-09-27
**Decision Makers:** The owner, through DEBT-472 (filed 2026-08-22, closed 2026-09-25) and the adjudication of 2026-09-24. ADR-023 moved decision history out of agent rules, so it is recorded here and `.claude/rules/testing.md` keeps only the rule.

---

## Context

- **Doubles hid regressions.** By August 2026 the tests used 325 `as unknown as` casts in 60 files, many shaped like the real SDK or ORM but behaving like nothing. Only 2 of 24 fakes were checked against their real adapters.
- **Two archived records disagreed.** DEBT-035 accepted a hand-built Drizzle query-builder chain cast to the repository's database type as a fake. DEBT-444 showed the same construct stays green through SQL and predicate regressions.
- **Nothing enforced a rule,** so each new suite reinvented one.

## Decision

1. **One vocabulary,** Meszaros and Fowler's: fake, stub, spy, mock and contract test.
2. **Choose a double by what the code under test needs:**
   - **Shape only**, for a hard-to-force error path: a narrowly typed, client-owned stub, with no cast.
   - **Behaviour** (state, sequencing, pagination, constraints, concurrency): a fake implementing the client-owned port, proven against the real implementation by a shared contract test.
3. **Adapter behaviour is tested against real infrastructure.** That means Postgres integration tests and provider contract tests. An adapter unit test covers only error translation that real infrastructure cannot force.
4. **A call-chain object is a stub, not a fake** (2026-09-24). DEBT-444 governs over DEBT-035. The one sanctioned repository unit pattern is the real query builder over `drizzle.mock({ schema })` with a spied `execute`, limited to driver failures.
5. **`vi.mock()` only for modules that cannot be injected,** such as `@clerk/nextjs`, `next/link` and `server-only`, and for Browser Mode's sealed boundaries with `{ spy: true }`.
6. **A ratchet keeps violations from growing.** `pnpm lint:doubles` counts own-code module mocks, unknown double casts and hand-rolled doubles for ports with maintained fakes. Each file's floor equals its live count, so a removed site cannot return. When a file with a floor is next edited, its sites move onto a maintained fake or a narrow seam.

The rule's text lives in `.claude/rules/testing.md`. The evidence that each fake matches its adapter is in `docs/guides/testing/fake-contracts.md`, which a test parses.

## Consequences

- **Gains:**
  - A double now fails when the real behaviour it stands for changes.
  - The contract register shows which fakes are proven.
  - The ratchet stops drift without a big-bang migration.
- **Costs:**
  - Behavioural tests of adapters need Docker Postgres or provider test mode.
  - Some legacy files keep their floors until someone edits them.

## Alternatives Rejected

- **Allow call-chain doubles as fakes,** as DEBT-035 did. They pass while the SQL they stand for is wrong.
- **Ban every stub.** Real infrastructure cannot force some driver and provider failures, and a shape-only stub is the honest way to test their translation.
- **Migrate every legacy double at once.** That is a large, risky change with no product value. The ratchet gets there file by file.

## Related

- [`.claude/rules/testing.md`](../../.claude/rules/testing.md): the rule.
- [The fake-contract register](../guides/testing/fake-contracts.md): the fake↔real evidence.
- [ADR-003](./adr-003-testing-strategy.md) and [ADR-019](./adr-019-test-quality-practices.md): the testing strategy and quality practices.
