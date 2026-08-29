# Testing Rules

## Framework: Vitest (NOT Jest)

Use **Vitest** exclusively. Do NOT use Jest APIs or `jest.mock()`.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

## TDD Mandate

ALL code MUST be test-driven. No exceptions.

1. Write the test first (Red)
2. Write minimum code to pass (Green)
3. Refactor if needed (Refactor)

## Test-Double Fidelity: Shape vs. Behavior

This section is the canonical live vocabulary and decision rule. Other agent and reviewer instructions reference it instead of defining competing versions.

### Vocabulary (Meszaros/Fowler taxonomy)

- **Fake:** a port implementation with working behavior, usually using an in-memory or otherwise simplified mechanism that is unsuitable for production.
- **Stub:** a double that provides canned answers. A call-chain object is a stub, not a fake.
- **Spy:** a stub that also records calls or other interaction data for later assertions.
- **Mock:** an interaction-focused double pre-programmed with expected calls and used to verify those interactions.
- **Contract test:** one observable scenario suite run against both a fake and the corresponding real adapter or provider, proving that both implementations honor the same port behavior.

### Decision rule

1. Ask what the code under test needs from the collaborator, regardless of who owns it.
2. If the test depends only on **shape** for a hard-to-force error-translation path, inject a narrowly typed stub containing only the consumed members. Do not use `as unknown as`. If the production constructor requires a larger type, extract a client-owned narrow seam first.
3. If the test depends on **behavior** — state, sequencing, replay, pagination, transitions, constraints, or concurrency — use a fake implementing the client-owned port and run the same behavior through a contract test against the real implementation. Use an existing fake before adding one. The application fake barrel is `src/application/test-helpers/fakes/index.ts`; Stripe Checkout client behavior uses adapter-owned `FakeStripeCheckoutClient` from `src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client.ts`.
4. Adapter behavior belongs against real infrastructure: Postgres in `tests/integration/` and supported provider behavior in the required provider-contract E2E lane. Unit-level adapter tests are limited to error translation that real infrastructure cannot safely or deterministically force.
5. If a unit test needs more than two stubs, spies, or mocks, refactor the production seam before adding the third.

Shape-only adapter unit-test pattern (the production adapter accepts this client-owned narrow seam):

```typescript
type UserLookup = {
  findFirst(): Promise<{ id: string } | null>;
};

const userLookup: UserLookup = {
  findFirst: async () => null,
};
```

Do not cast a larger call-chain object into the SDK/ORM type. When behavior matters, use the maintained fake plus its shared fake↔real contract scenario instead.

Do not trust an inline SDK stub to model runtime binding. `.claude/rules/architecture.md:45` records BUG-069/070: detached SDK methods depend on `this`, which `vi.fn()` stubs cannot prove.

**`vi.mock()` exceptions:**

- External SDK/framework modules that cannot be injected, such as `@clerk/nextjs`, `next/link`, and `server-only`.
- Browser Mode sealed ESM controller boundaries, using only `vi.mock(path, { spy: true })`; factory form replaces real exports and is not the repository pattern.

The executable DEBT-472 ratchet runs through `pnpm lint:doubles` and blocks growth in own-code module mocks, unknown double casts, and hand-rolled doubles for ports with maintained fakes. Local `pnpm lint` and required CI invoke it; it is deliberately not a Vitest `globalSetup` tax.

The live fake↔real evidence, dated waivers, and explicit known divergences are in `docs/dev/test-double-contract-register.md`. Update that register whenever a maintained fake or its corresponding adapter changes; a missing note is not equivalent to “no known divergence.”

## Test Environment Isolation

Tests that mutate `process.env` (module-scope defaults, `vi.stubEnv()`, or direct assignment) MUST snapshot/restore via `tests/shared/process-env.ts`. See **`.claude/rules/test-isolation.md`** for the full rule, cleanup ordering, and examples.

## Fixture Integrity

Tests and test helpers that create boundary-shaped fixtures MUST keep application-owned IDs valid at controller/DB boundaries and MUST leave provider IDs, fake-backed semantic keys, UI tokens, and intentional-invalid fixtures alone. See **`.claude/rules/fixture-integrity.md`** for the full FIX/LEAVE rule, UUID-linkage mechanics, and `vi.hoisted()` guidance.

## Test Quality

1. Test behavior, not implementation
2. One concept per `it()`
3. Arrange-Act-Assert pattern
4. Use factories: `createQuestion()`, `createChoice()` from `src/domain/test-helpers/`
5. Descriptive names: `it('returns isCorrect=false when incorrect choice selected')`
6. Prefer semantic assertions over exact utility-class strings

### Styling Assertions

- Prefer stable markers (`role`, visible text, `href`, `data-testid`) for UI tests.
- Exact Tailwind class-string assertions are allowed only when the class itself encodes behavior (e.g. `sr-only`, breakpoint visibility, focus-ring presence, active-state tokens).
- Avoid asserting full space-delimited class strings for purely presentational styles.

### `renderToStaticMarkup` Structure Assertions

- Do not assert raw HTML tag-shape fragments or DOM order through serialized string offsets (for example, `toContain('<main')`, `toMatch(/<button.../)`, or `html.indexOf('A') < html.indexOf('B')`) unless the tag or order itself is the behavior under test: accessibility landmarks/grouping, sanitization, standalone document shells, component-system primitives, or intentionally ordered output.
- For behavior-bearing markup from `renderToStaticMarkup`, parse the HTML and assert through stable DOM seams: text, `role`/landmark-equivalent structure, `href`, `data-testid`, disabled state, heading level, fieldset/legend grouping, or node order via `compareDocumentPosition`.
- Use `tests/shared/dom-helpers.ts` as the canonical helper surface for parsed static-markup tests (`parseHtml`, `findAnchorByHref`, text/heading/button/fieldset helpers, and node-order checks). Add a helper there before duplicating ad hoc DOMParser/query code across files.
- Document-shell tests are the exception where `DOMParser` alone is insufficient because it synthesizes `<html>`/`<head>` around fragments; use the shared explicit-shell helper or a clearly commented behavior-only assertion.
- Do not replace raw-fragment assertions with snapshots. Snapshots preserve the same structure coupling with a larger failure surface.

## Test Locations

| Type | Pattern | Command |
|------|---------|---------|
| Unit (logic) | `*.test.ts` colocated | `pnpm test` |
| Component (render) | `*.test.tsx` colocated | `pnpm test` |
| Hook (async/interactive) | `*.browser.spec.tsx` colocated | `pnpm test:browser` |
| Integration | `tests/integration/*.integration.test.ts` | `pnpm test:integration` |
| E2E | `tests/e2e/*.spec.ts` | `pnpm test:e2e` |
