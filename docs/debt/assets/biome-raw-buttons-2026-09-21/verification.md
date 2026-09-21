# Raw JSX button guard replacement — 2026-09-21

Base: `066f3e1b` (promotion #961). Property: production raw JSX buttons are
forbidden outside the existing primitives and single mobile-nav exception.
No application file, exception policy, opacity check, or render assertion changes.

## Red before replacement

At 02:07:42 UTC, the new actual-Biome contract and existing theme suite ran:

```text
pnpm test --run tests/raw-button-lint-policy.test.ts components/theme-token-regression.test.tsx
Test Files  1 failed | 1 passed (2)
Tests       2 failed | 31 passed (33)
rejects a raw JSX button in app/example/page.tsx
rejects a raw JSX button in components/example-cta.tsx
AssertionError: expected +0 to be 1
```

The old scanner's synthetic raw-button rejection passed in that same run.
Only the new lint rejection failed: the existing Biome configuration accepted
the same forbidden element. After adding the scoped `noRestrictedElements`
rule, all 33 cases passed before the general scanner was removed.

Biome can exempt a file but cannot require exactly one occurrence in it.
The mobile-nav cardinality therefore stays as a small source check. At
02:08:05 UTC, mutating its rejection condition to `actualCount < 0` failed
both new count cases (zero and two): expected one diagnostic, received `[]`.
The mutation was removed; the general scanner was replaced with only that
cardinality check. At 02:08:35 UTC, the two suites passed **34/34** (13 lint
cases and 21 theme cases). Focused Biome checks passed too.

## Scope and limits

- Real Biome runs against a temporary copy of the repository configuration;
  only Git discovery is disabled because the fixture directory is not a repo.
- Both production roots reject raw JSX. `<Button>` remains allowed.
- `components/ui/`, `components/mobile-nav.tsx`, and the four existing test
  suffix exclusions remain unchanged; no new exemption is introduced.
- The live mobile-nav exact-one count, opacity policy, and render contracts
  remain in the unit lane.
- Neither the old regex nor this JSX rule covers `React.createElement('button')`.
  This replacement does not claim that additional property.

Full-gate counts, exact-head review, merge and promotion receipts will be
recorded on the PR; focused proof alone is not release evidence.
